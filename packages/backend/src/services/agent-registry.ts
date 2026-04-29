import path from "node:path";
import {
  AgentConfigSchema,
  AgentConfigTemplateSchema,
  CreateAgentInputSchema,
  UpdateAgentInputSchema,
  DEFAULT_AVAILABLE_TOOLS,
  ENTITY_TYPE,
  RELATIONSHIP_TYPE,
  BASE_CIRCLE_ID,
  type AgentConfig,
  type AgentConfigTemplate,
  type CreateAgentInput,
  type UpdateAgentInput,
  CROW_SYSTEM_AGENT_ID,
  CROW_TASK_DISPATCHER_AGENT_ID,
  SERVER_MESSAGE_TYPE,
} from "@crow-central-agency/shared";
import { EventBus } from "../core/event-bus/event-bus.js";
import type { AgentRegistryEvents } from "./agent-registry.types.js";
import type { WsBroadcaster } from "./ws-broadcaster.js";
import type { AgentCircleManager } from "./agent-circle-manager.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { env } from "../config/env.js";
import { AGENTS_DIR_NAME, AGENT_MD_FILENAME, DEFAULT_PROJECT_DIR_NAME } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { generateId, SYSTEM_AGENT_IDS } from "../utils/id-utils.js";
import { REDACTED_BOT_TOKEN, sanitizeAgentConfig } from "../utils/agent-config-sanitizer.js";
import { readTextFile, writeTextFile, ensureDir, removeDir, assertWithinBase } from "../utils/fs-utils.js";
import { getCrowAgent } from "../agents/crow-agent.js";
import { getTaskDispatcherAgent } from "../agents/crow-task-dispatcher-agent.js";
import type { ObjectStoreProvider } from "../core/store/object-store.types.js";

const log = logger.child({ context: "agent-registry" });

/** Object store table name for agent configs */
export const AGENT_STORE_TABLE = "agents";
export const AGENT_TEMPLATES_TABLE = "templates";

/**
 * Agent registry - CRUD for agent configs.
 * User agent configs are persisted via the object store.
 * Each agent gets a folder for AGENT.md and artifacts.
 * Owns agent lifecycle including circle membership management.
 */
export class AgentRegistry extends EventBus<AgentRegistryEvents> {
  private agents = new Map<string, AgentConfig>();
  private readonly agentsBaseDir: string;

  constructor(
    private readonly store: ObjectStoreProvider,
    private readonly templateStore: ObjectStoreProvider,
    private readonly broadcaster: WsBroadcaster,
    private readonly circleManager: AgentCircleManager
  ) {
    super();
    this.agentsBaseDir = path.join(env.CROW_SYSTEM_PATH, AGENTS_DIR_NAME);
  }

  /**
   * Load agent configs from the object store on startup.
   */
  public async initialize(): Promise<void> {
    await ensureDir(this.agentsBaseDir);

    // Register built-in system agents
    this.agents.set(CROW_SYSTEM_AGENT_ID, getCrowAgent());
    this.agents.set(CROW_TASK_DISPATCHER_AGENT_ID, getTaskDispatcherAgent());

    const storeEntries = await this.store.getAll<AgentConfig>(AGENT_STORE_TABLE);
    for (const entry of storeEntries) {
      const result = AgentConfigSchema.safeParse(entry.value);
      if (!result.success) {
        log.warn({ issues: result.error.issues }, "Skipping invalid agent config in object store");

        continue;
      }

      if (!SYSTEM_AGENT_IDS.has(result.data.id)) {
        this.agents.set(result.data.id, result.data);
      }
    }

    // Assign orphan non-system agents to Base Circle
    await this.assignOrphanAgentsToBaseCircle();

    log.info({ count: this.agents.size }, "Agent registry initialized");
  }

  /** Get all agent configs */
  public getAllAgents(includeBackgroundAgent?: boolean): AgentConfig[] {
    return Array.from(this.agents.values()).filter((config) => includeBackgroundAgent || !config.isBackgroundAgent);
  }

  /**
   * Get a single agent config by ID.
   * @throws AppError with AGENT_NOT_FOUND if the agent does not exist.
   */
  public getAgent(agentId: string): AgentConfig {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new AppError(`Agent not found: ${agentId}`, APP_ERROR_CODES.AGENT_NOT_FOUND);
    }

    return agent;
  }

  public getAgentName(agentId?: string): string {
    if (!agentId) {
      return "";
    }

    return this.getAgent(agentId).name;
  }

  /** Resolve agent workspace, falling back to the default project directory */
  public resolveWorkspace(agent: AgentConfig): string {
    return agent.workspace ?? path.join(env.CROW_SYSTEM_PATH, DEFAULT_PROJECT_DIR_NAME);
  }

  /**
   * Resolve all peer agents visible to the given agent through circle memberships.
   * Excludes background agents.
   */
  public getPeerAgents(agentId: string): AgentConfig[] {
    const visibleAgentIds = this.circleManager.getVisibleAgentIds(agentId);

    const peers: AgentConfig[] = [];
    for (const peerAgentId of visibleAgentIds) {
      try {
        const agent = this.getAgent(peerAgentId);
        if (!agent.isBackgroundAgent) {
          peers.push(agent);
        }
      } catch (error) {
        if (error instanceof AppError && error.errorCode === APP_ERROR_CODES.AGENT_NOT_FOUND) {
          log.debug({ peerAgentId }, "Peer agent no longer exists, skipping");
        } else {
          throw error;
        }
      }
    }

    return peers;
  }

  /** Create a new agent */
  public async createAgent(input: CreateAgentInput): Promise<AgentConfig> {
    const validated = CreateAgentInputSchema.parse(input);
    const { agentMd, ...configFields } = validated;
    const now = new Date().toISOString();
    const id = generateId();

    const agent = AgentConfigSchema.parse({
      ...configFields,
      id,
      availableTools: [...DEFAULT_AVAILABLE_TOOLS],
      createdAt: now,
      updatedAt: now,
    });

    // Create agent folder
    const agentDir = this.getAgentDir(id);
    await ensureDir(agentDir);

    // Write AGENT.md if provided
    if (agentMd !== undefined) {
      await writeTextFile(this.getAgentMdPath(id), agentMd);
    }

    this.agents.set(id, agent);
    await this.store.set(AGENT_STORE_TABLE, id, agent);

    // Add Base Circle membership for non-system agents
    if (!agent.isSystemAgent) {
      await this.addBaseCircleMembership(id);
    }

    log.info({ agentId: id, name: agent.name }, "Agent created");
    this.emit("agentCreated", { agent });
    this.broadcaster.broadcast({
      type: SERVER_MESSAGE_TYPE.AGENT_CREATED,
      agentId: id,
      config: sanitizeAgentConfig(agent),
    });

    return agent;
  }

  /** Update an existing agent - system agents cannot be updated */
  public async updateAgent(agentId: string, input: UpdateAgentInput): Promise<AgentConfig> {
    const existing = this.getAgent(agentId);
    try {
      this.assertMutable(existing);
    } catch {
      // Ignore update to system agent, this is normal
      return existing;
    }

    const validated = UpdateAgentInputSchema.parse(input);
    const { agentMd, ...configFields } = validated;
    const now = new Date().toISOString();

    const updated: AgentConfig = {
      ...existing,
      ...configFields,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    // Normalize empty string to undefined for optional path fields
    if (updated.workspace !== undefined && updated.workspace.trim() === "") {
      updated.workspace = undefined;
    }

    // Preserve existing bot token if the update contains the redacted placeholder
    if (updated.discordConfig?.botToken === REDACTED_BOT_TOKEN && existing.discordConfig?.botToken) {
      updated.discordConfig = { ...updated.discordConfig, botToken: existing.discordConfig.botToken };
    }

    this.agents.set(agentId, updated);
    await this.store.set(AGENT_STORE_TABLE, agentId, updated);

    // Write AGENT.md if provided
    if (agentMd !== undefined) {
      await writeTextFile(this.getAgentMdPath(agentId), agentMd);
    }

    log.info({ agentId, name: updated.name }, "Agent updated");
    this.emit("agentUpdated", { agent: updated });
    this.broadcaster.broadcast({
      type: SERVER_MESSAGE_TYPE.AGENT_UPDATED,
      agentId,
      config: sanitizeAgentConfig(updated),
    });

    return updated;
  }

  /**
   * Persist the set of tools the SDK actually exposed for this agent on its
   * last run. Runtime-only write path — not part of user-driven updates.
   */
  public async setAvailableTools(agentId: string, tools: string[]): Promise<void> {
    const existing = this.getAgent(agentId);
    try {
      this.assertMutable(existing);
    } catch {
      return;
    }

    const updated: AgentConfig = {
      ...existing,
      availableTools: tools,
      updatedAt: new Date().toISOString(),
    };

    this.agents.set(agentId, updated);
    await this.store.set(AGENT_STORE_TABLE, agentId, updated);
    this.broadcaster.broadcast({
      type: SERVER_MESSAGE_TYPE.AGENT_UPDATED,
      agentId,
      config: sanitizeAgentConfig(updated),
    });
  }

  /** Delete an agent and its folder - system agents cannot be deleted */
  public async deleteAgent(agentId: string): Promise<void> {
    const existing = this.getAgent(agentId);
    this.assertMutable(existing);

    // Remove circle relationships first
    await this.circleManager.removeRelationshipsForEntity(agentId);

    // Remove from Map and store
    this.agents.delete(agentId);
    await this.store.delete(AGENT_STORE_TABLE, agentId);

    // Remove agent folder last (AGENT.md + artifacts)
    const agentDir = this.getAgentDir(agentId);
    await removeDir(agentDir);

    log.info({ agentId, name: existing.name }, "Agent deleted");
    this.emit("agentDeleted", { agentId });
    this.broadcaster.broadcast({
      type: SERVER_MESSAGE_TYPE.AGENT_DELETED,
      agentId,
    });
  }

  /**
   * Save an existing agent's config as a reusable template.
   * If a template with the same name already exists, its contents are
   * overwritten and the existing templateId is preserved.
   */
  public async saveAgentAsTemplate(agentId: string, templateName: string): Promise<AgentConfigTemplate> {
    const agent = this.getAgent(agentId);
    const agentMd = await this.getAgentMd(agentId);
    const existing = await this.findTemplateByName(templateName);
    const template = AgentConfigTemplateSchema.parse({
      templateId: existing?.templateId ?? generateId(),
      templateName,
      description: agent.description,
      workspace: agent.workspace,
      persona: agent.persona,
      model: agent.model,
      permissionMode: agent.permissionMode,
      settingSources: agent.settingSources,
      availableTools: agent.availableTools,
      toolConfig: agent.toolConfig,
      mcpServerIds: agent.mcpServerIds,
      configuredFeeds: agent.configuredFeeds,
      sensorIds: agent.sensorIds,
      loop: agent.loop,
      agentMd,
    });

    await this.templateStore.set(AGENT_TEMPLATES_TABLE, template.templateId, template);
    return template;
  }

  /** Delete a saved template by templateId. Returns true if an entry was removed. */
  public async deleteTemplate(templateId: string): Promise<boolean> {
    return this.templateStore.delete(AGENT_TEMPLATES_TABLE, templateId);
  }

  /** Get all saved agent config templates */
  public async getTemplates(): Promise<AgentConfigTemplate[]> {
    const entries = await this.templateStore.getAll<AgentConfigTemplate>(AGENT_TEMPLATES_TABLE);
    const templates: AgentConfigTemplate[] = [];
    for (const entry of entries) {
      const result = AgentConfigTemplateSchema.safeParse(entry.value);
      if (!result.success) {
        log.warn({ issues: result.error.issues }, "Skipping invalid agent template in object store");
        continue;
      }

      templates.push(result.data);
    }

    return templates;
  }

  /** Read the agent's AGENT.md file. Returns undefined if the file does not exist. */
  public async getAgentMd(agentId: string): Promise<string | undefined> {
    this.getAgent(agentId);
    const mdPath = this.getAgentMdPath(agentId);

    try {
      return await readTextFile(mdPath);
    } catch (error) {
      if (error instanceof AppError && error.errorCode === APP_ERROR_CODES.NOT_FOUND) {
        return undefined;
      }

      throw error;
    }
  }

  /** Write the agent's AGENT.md file - system agents cannot be modified */
  public async setAgentMd(agentId: string, content: string): Promise<void> {
    const agent = this.getAgent(agentId);
    this.assertMutable(agent);
    const mdPath = this.getAgentMdPath(agentId);
    await writeTextFile(mdPath, content);

    log.info({ agentId, name: agent.name }, "AGENT.md updated");
  }

  /** Find a saved template by exact templateName match, or undefined if none */
  private async findTemplateByName(templateName: string): Promise<AgentConfigTemplate | undefined> {
    const templates = await this.getTemplates();
    return templates.find((template) => template.templateName === templateName);
  }

  /** Throw if the agent is a system agent and cannot be modified */
  private assertMutable(agent: AgentConfig): void {
    if (agent.isSystemAgent) {
      throw new AppError(`System agent "${agent.name}" cannot be modified`, APP_ERROR_CODES.AGENT_IMMUTABLE);
    }
  }

  /** Assign orphan non-system agents to Base Circle */
  private async assignOrphanAgentsToBaseCircle(): Promise<void> {
    let assignedCount = 0;
    for (const agent of this.agents.values()) {
      if (agent.isSystemAgent) {
        continue;
      }

      if (this.circleManager.getCirclesForEntity(agent.id, ENTITY_TYPE.AGENT).length === 0) {
        await this.addBaseCircleMembership(agent.id);
        assignedCount++;
      }
    }

    if (assignedCount > 0) {
      log.info({ count: assignedCount }, "Assigned orphan agents to Base Circle");
    }
  }

  /** Add Base Circle membership for an agent */
  private async addBaseCircleMembership(agentId: string): Promise<void> {
    await this.circleManager.createRelationship({
      sourceEntityId: BASE_CIRCLE_ID,
      sourceEntityType: ENTITY_TYPE.AGENT_CIRCLE,
      targetEntityId: agentId,
      targetEntityType: ENTITY_TYPE.AGENT,
      relationshipType: RELATIONSHIP_TYPE.MEMBERSHIP,
    });
  }

  /** Get the agent's folder path with traversal protection */
  private getAgentDir(agentId: string): string {
    const agentDir = path.join(this.agentsBaseDir, agentId);
    assertWithinBase(agentDir, this.agentsBaseDir);

    return agentDir;
  }

  /** Get the path to the agent's AGENT.md file */
  private getAgentMdPath(agentId: string): string {
    return path.join(this.getAgentDir(agentId), AGENT_MD_FILENAME);
  }
}
