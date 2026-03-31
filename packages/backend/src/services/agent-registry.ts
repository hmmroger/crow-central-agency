import path from "node:path";
import {
  AgentConfigSchema,
  CreateAgentInputSchema,
  UpdateAgentInputSchema,
  DEFAULT_AVAILABLE_TOOLS,
  type AgentConfig,
  type CreateAgentInput,
  type UpdateAgentInput,
  CROW_SYSTEM_AGENT_ID,
} from "@crow-central-agency/shared";
import { EventBus } from "../event-bus/event-bus.js";
import type { AgentRegistryEvents } from "./agent-registry.types.js";
import type { WsBroadcaster } from "./ws-broadcaster.js";
import { AppError } from "../error/app-error.js";
import { APP_ERROR_CODES } from "../error/app-error.types.js";
import { env } from "../config/env.js";
import { AGENTS_DIR_NAME, AGENTS_CONFIG_FILENAME, AGENT_MD_FILENAME } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { generateId } from "../utils/id-utils.js";
import {
  readJsonFile,
  writeJsonFile,
  readTextFile,
  writeTextFile,
  ensureDir,
  removeDir,
  assertWithinBase,
} from "../utils/fs-utils.js";
import { getCrowAgent } from "../agents/crow-agent.js";

const log = logger.child({ context: "agent-registry" });

/** Known system agent IDs - authoritative source for persist, load, and route validation */
export const SYSTEM_AGENT_IDS = new Set([CROW_SYSTEM_AGENT_ID]);

/**
 * Agent registry - CRUD for agent configs with file persistence.
 * All configs stored in a single agents.json file.
 * Each agent gets a folder for AGENT.md and artifacts.
 */
export class AgentRegistry extends EventBus<AgentRegistryEvents> {
  private agents = new Map<string, AgentConfig>();
  private readonly agentsFilePath: string;
  private readonly agentsBaseDir: string;

  constructor(private readonly broadcaster: WsBroadcaster) {
    super();
    this.agentsFilePath = path.join(env.CROW_SYSTEM_PATH, AGENTS_CONFIG_FILENAME);
    this.agentsBaseDir = path.join(env.CROW_SYSTEM_PATH, AGENTS_DIR_NAME);
  }

  /** Load all agent configs from agents.json on startup, validating each against schema */
  public async initialize(): Promise<void> {
    await ensureDir(this.agentsBaseDir);

    // Register built-in system agents
    this.agents.set(CROW_SYSTEM_AGENT_ID, getCrowAgent());

    try {
      const data = await readJsonFile<unknown[]>(this.agentsFilePath);

      for (const raw of data) {
        const result = AgentConfigSchema.safeParse(raw);

        if (result.success) {
          // Skip persisted entries that collide with a system agent ID
          if (SYSTEM_AGENT_IDS.has(result.data.id)) {
            log.warn({ id: result.data.id }, "Skipping persisted entry that conflicts with a system agent ID");

            continue;
          }

          this.agents.set(result.data.id, result.data);
        } else {
          log.warn(
            { id: (raw as { id?: unknown }).id, issues: result.error.issues },
            "Skipping invalid agent config on load"
          );
        }
      }
    } catch (error) {
      if (error instanceof AppError && error.errorCode === APP_ERROR_CODES.NOT_FOUND) {
        log.info("No agents.json found - starting with empty registry");
      } else {
        throw error;
      }
    }

    log.info({ count: this.agents.size }, "Agent registry initialized");
  }

  /** Get all agent configs */
  public getAllAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
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

    // Persist
    this.agents.set(id, agent);
    await this.persist();

    log.info({ agentId: id, name: agent.name }, "Agent created");
    this.emit("agentCreated", { agent });

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

    this.agents.set(agentId, updated);
    await this.persist();

    // Write AGENT.md if provided
    if (agentMd !== undefined) {
      await writeTextFile(this.getAgentMdPath(agentId), agentMd);
    }

    log.info({ agentId, name: updated.name }, "Agent updated");
    this.emit("agentUpdated", { agent: updated });
    this.broadcaster.broadcast({
      type: "agent_updated",
      agentId,
      config: updated,
    });

    return updated;
  }

  /** Delete an agent and its folder - system agents cannot be deleted */
  public async deleteAgent(agentId: string): Promise<void> {
    const existing = this.getAgent(agentId);
    this.assertMutable(existing);

    // Persist JSON first - orphaned folder is recoverable; orphaned JSON entry is not
    this.agents.delete(agentId);
    await this.persist();

    // Then remove agent folder (AGENT.md + artifacts)
    const agentDir = this.getAgentDir(agentId);
    await removeDir(agentDir);

    log.info({ agentId, name: existing.name }, "Agent deleted");
    this.emit("agentDeleted", { agentId });
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

  /** Throw if the agent is a system agent and cannot be modified */
  private assertMutable(agent: AgentConfig): void {
    if (agent.isSystemAgent) {
      throw new AppError(`System agent "${agent.name}" cannot be modified`, APP_ERROR_CODES.AGENT_IMMUTABLE);
    }
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

  /** Persist all user-created agent configs to agents.json - excludes system agents by known ID */
  private async persist(): Promise<void> {
    const data = Array.from(this.agents.values()).filter((agent) => !SYSTEM_AGENT_IDS.has(agent.id));
    await writeJsonFile(this.agentsFilePath, data);
  }
}
