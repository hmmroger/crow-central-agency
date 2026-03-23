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

  constructor(crowSystemPath: string) {
    super();
    this.agentsFilePath = path.join(crowSystemPath, "agents.json");
    this.agentsBaseDir = path.join(crowSystemPath, "agents");
  }

  /** Load all agent configs from agents.json on startup */
  async initialize(): Promise<void> {
    await ensureDir(this.agentsBaseDir);
    const data = await readJsonFile<AgentConfig[]>(this.agentsFilePath);

    if (data) {
      for (const agent of data) {
        this.agents.set(agent.id, agent);
      }
    }

    log.info({ count: this.agents.size }, "Agent registry initialized");
  }

  /** Get all agent configs */
  getAll(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  /** Get a single agent config by ID */
  get(agentId: string): AgentConfig | undefined {
    return this.agents.get(agentId);
  }

  /** Create a new agent */
  async create(input: CreateAgentInput): Promise<AgentConfig> {
    const validated = CreateAgentInputSchema.parse(input);
    const now = new Date().toISOString();
    const id = generateId();

    const agent = AgentConfigSchema.parse({
      ...validated,
      id,
      availableTools: [...DEFAULT_AVAILABLE_TOOLS],
      createdAt: now,
      updatedAt: now,
    });

    // Create agent folder
    const agentDir = this.getAgentDir(id);
    await ensureDir(agentDir);

    // Persist
    this.agents.set(id, agent);
    await this.persist();

    log.info({ agentId: id, name: agent.name }, "Agent created");
    this.emit("agentCreated", { agent });

    return agent;
  }

  /** Update an existing agent */
  async update(agentId: string, input: UpdateAgentInput): Promise<AgentConfig> {
    const existing = this.agents.get(agentId);

    if (!existing) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const validated = UpdateAgentInputSchema.parse(input);
    const now = new Date().toISOString();

    const updated: AgentConfig = {
      ...existing,
      ...validated,
      id: existing.id, // Prevent ID override
      createdAt: existing.createdAt, // Prevent createdAt override
      updatedAt: now,
    };

    this.agents.set(agentId, updated);
    await this.persist();

    log.info({ agentId, name: updated.name }, "Agent updated");
    this.emit("agentUpdated", { agent: updated });

    return updated;
  }

  /** Delete an agent and its folder */
  async delete(agentId: string): Promise<void> {
    const existing = this.agents.get(agentId);

    if (!existing) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Remove agent folder (AGENT.md + artifacts)
    const agentDir = this.getAgentDir(agentId);
    await removeDir(agentDir);

    // Remove from registry
    this.agents.delete(agentId);
    await this.persist();

    log.info({ agentId, name: existing.name }, "Agent deleted");
    this.emit("agentDeleted", { agentId });
  }

  /** Read the agent's AGENT.md file. Returns undefined if not found. */
  async getAgentMd(agentId: string): Promise<string | undefined> {
    const mdPath = this.getAgentMdPath(agentId);

    return readTextFile(mdPath);
  }

  /** Write the agent's AGENT.md file */
  async setAgentMd(agentId: string, content: string): Promise<void> {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent not found: ${agentId}`);
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
    return path.join(this.getAgentDir(agentId), "AGENT.md");
  }

  /** Persist all agent configs to agents.json */
  private async persist(): Promise<void> {
    const data = Array.from(this.agents.values());
    await writeJsonFile(this.agentsFilePath, data);
  }
}
