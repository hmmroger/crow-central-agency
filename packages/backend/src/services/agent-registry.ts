import path from "node:path";
import {
  AgentConfigSchema,
  CreateAgentInputSchema,
  UpdateAgentInputSchema,
  DEFAULT_AVAILABLE_TOOLS,
  type AgentConfig,
  type CreateAgentInput,
  type UpdateAgentInput,
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

const log = logger.child({ context: "agent-registry" });

/**
 * Agent registry — CRUD for agent configs with file persistence.
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

    try {
      const data = await readJsonFile<unknown[]>(this.agentsFilePath);

      for (const raw of data) {
        const result = AgentConfigSchema.safeParse(raw);

        if (result.success) {
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
        log.info("No agents.json found — starting with empty registry");
      } else {
        throw error;
      }
    }

    log.info({ count: this.agents.size }, "Agent registry initialized");
  }

  /** Get all agent configs */
  public getAll(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  /** Get a single agent config by ID */
  public get(agentId: string): AgentConfig | undefined {
    return this.agents.get(agentId);
  }

  /** Create a new agent */
  public async create(input: CreateAgentInput): Promise<AgentConfig> {
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

  /** Update an existing agent */
  public async update(agentId: string, input: UpdateAgentInput): Promise<AgentConfig> {
    const existing = this.agents.get(agentId);

    if (!existing) {
      throw new AppError(`Agent not found: ${agentId}`, APP_ERROR_CODES.AGENT_NOT_FOUND);
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

  /** Delete an agent and its folder */
  public async delete(agentId: string): Promise<void> {
    const existing = this.agents.get(agentId);

    if (!existing) {
      throw new AppError(`Agent not found: ${agentId}`, APP_ERROR_CODES.AGENT_NOT_FOUND);
    }

    // Persist JSON first — orphaned folder is recoverable; orphaned JSON entry is not
    this.agents.delete(agentId);
    await this.persist();

    // Then remove agent folder (AGENT.md + artifacts)
    const agentDir = this.getAgentDir(agentId);
    await removeDir(agentDir);

    log.info({ agentId, name: existing.name }, "Agent deleted");
    this.emit("agentDeleted", { agentId });
  }

  /** Read the agent's AGENT.md file. Returns undefined if not found. */
  public async getAgentMd(agentId: string): Promise<string | undefined> {
    if (!this.agents.has(agentId)) {
      throw new AppError(`Agent not found: ${agentId}`, APP_ERROR_CODES.AGENT_NOT_FOUND);
    }

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

  /** Write the agent's AGENT.md file */
  public async setAgentMd(agentId: string, content: string): Promise<void> {
    if (!this.agents.has(agentId)) {
      throw new AppError(`Agent not found: ${agentId}`, APP_ERROR_CODES.AGENT_NOT_FOUND);
    }

    const mdPath = this.getAgentMdPath(agentId);
    await writeTextFile(mdPath, content);

    log.info({ agentId }, "AGENT.md updated");
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

  /** Persist all agent configs to agents.json */
  private async persist(): Promise<void> {
    const data = Array.from(this.agents.values());
    await writeJsonFile(this.agentsFilePath, data);
  }
}
