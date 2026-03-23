import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { AGENT_STATUS, AgentRuntimeStateSchema, type AgentRuntimeState } from "@crow-central-agency/shared";
import { EventBus } from "../event-bus/event-bus.js";
import type { OrchestratorEvents, RunningAgent, McpServerFactory } from "./agent-orchestrator.types.js";
import type { AgentRegistry } from "./agent-registry.js";
import { processStream } from "../stream/stream-processor.js";
import { AppError } from "../error/app-error.js";
import { AppErrorCodes } from "../error/app-error.types.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { readJsonFile, writeJsonFile } from "../utils/fs-utils.js";
import path from "node:path";

const log = logger.child({ context: "orchestrator" });

/** Path to persisted orchestrator state */
const STATE_FILE = "orchestrator-state.json";

/**
 * Agent orchestrator — central state machine that owns agent runtimes.
 * Creates SDK queries, processes streams, coordinates lifecycle, persists state.
 */
export class AgentOrchestrator extends EventBus<OrchestratorEvents> {
  private runningAgents = new Map<string, RunningAgent>();
  private runtimeStates = new Map<string, AgentRuntimeState>();
  private mcpServerFactories = new Map<string, McpServerFactory>();
  private stateFilePath: string;

  constructor(
    private readonly registry: AgentRegistry,
    crowSystemPath: string
  ) {
    super();
    this.stateFilePath = path.join(crowSystemPath, STATE_FILE);
  }

  /** Load persisted runtime states and run startup recovery */
  async initialize(): Promise<void> {
    const saved = await readJsonFile<unknown[]>(this.stateFilePath);

    if (saved) {
      for (const raw of saved) {
        const result = AgentRuntimeStateSchema.safeParse(raw);

        if (result.success) {
          this.runtimeStates.set(result.data.agentId, result.data);
        } else {
          log.warn(
            { id: (raw as { agentId?: unknown }).agentId, issues: result.error.issues },
            "Skipping invalid runtime state on load"
          );
        }
      }

      log.info({ count: this.runtimeStates.size }, "Loaded persisted runtime states");
    }

    await this.runStartupRecovery();
  }

  /** Register a factory that creates per-agent MCP server instances */
  registerMcpServer(name: string, factory: McpServerFactory): void {
    this.mcpServerFactories.set(name, factory);
    log.info({ name }, "MCP server factory registered");
  }

  /** Get runtime state for an agent */
  getState(agentId: string): AgentRuntimeState | undefined {
    return this.runtimeStates.get(agentId);
  }

  /** Get all runtime states */
  getAllStates(): AgentRuntimeState[] {
    return Array.from(this.runtimeStates.values());
  }

  /**
   * Send a message to an agent — creates an SDK query and processes the stream.
   * The agent must be idle.
   */
  async sendMessage(agentId: string, message: string): Promise<void> {
    const agentConfig = this.registry.get(agentId);

    if (!agentConfig) {
      throw new AppError(`Agent not found: ${agentId}`, AppErrorCodes.AgentNotFound);
    }

    const state = this.ensureState(agentId);

    if (state.status !== AGENT_STATUS.IDLE && state.status !== AGENT_STATUS.ERROR) {
      throw new AppError(`Agent ${agentId} is busy (status: ${state.status})`, AppErrorCodes.AgentBusy);
    }

    // Build system prompt: persona + AGENT.md + peer list
    const agentMd = await this.registry.getAgentMd(agentId);
    const peerList = this.buildPeerList(agentId);
    const appendPrompt = [agentConfig.persona, agentMd, peerList].filter(Boolean).join("\n\n");

    // Build SDK options
    const abortController = new AbortController();
    const toolsOption = agentConfig.toolConfig.mode === "restricted" ? agentConfig.toolConfig.tools : undefined;

    const sdkOptions = {
      cwd: agentConfig.workspace,
      model: agentConfig.model,
      resume: state.sessionId,
      systemPrompt: appendPrompt
        ? { type: "preset" as const, preset: "claude_code" as const, append: appendPrompt }
        : { type: "preset" as const, preset: "claude_code" as const },
      abortController,
      includePartialMessages: true,
      permissionMode: agentConfig.permissionMode as
        | "default"
        | "acceptEdits"
        | "bypassPermissions"
        | "plan"
        | "dontAsk",
      allowedTools: agentConfig.toolConfig.autoApprovedTools,
      tools: toolsOption,
      settingSources: agentConfig.settingSources as ("user" | "project" | "local")[],
      mcpServers: this.buildMcpServers(agentId),
      persistSession: true,
      agentProgressSummaries: true,
      pathToClaudeCodeExecutable: env.CLAUDE_CLI_PATH,
    };

    // Create query (mcpServers cast will be properly typed when MCP servers are implemented in Phase 5)
    const queryInstance = sdkQuery({
      prompt: message,
      options: sdkOptions as Parameters<typeof sdkQuery>[0]["options"],
    });

    // Track running agent
    this.runningAgents.set(agentId, { query: queryInstance, abortController });
    this.setStatus(agentId, AGENT_STATUS.STREAMING);

    // Process stream
    try {
      const streamResult = await processStream(agentId, queryInstance, (wsMessage) => {
        this.emit("agentMessage", { agentId, message: wsMessage });
      });

      // Capture session ID
      if (streamResult.sessionId) {
        state.sessionId = streamResult.sessionId;
      }

      // Update available tools from init message
      if (streamResult.discoveredTools && streamResult.discoveredTools.length > 0) {
        await this.registry.update(agentId, { availableTools: streamResult.discoveredTools });
      }

      // Update session usage
      state.sessionUsage = {
        inputTokens: state.sessionUsage.inputTokens + (streamResult.inputTokens ?? 0),
        outputTokens: state.sessionUsage.outputTokens + (streamResult.outputTokens ?? 0),
        totalCostUsd: streamResult.totalCostUsd ?? state.sessionUsage.totalCostUsd,
        contextUsed: streamResult.contextUsed ?? state.sessionUsage.contextUsed,
        contextTotal: streamResult.contextTotal ?? state.sessionUsage.contextTotal,
      };

      if (streamResult.success) {
        state.lastError = undefined;
        this.setStatus(agentId, AGENT_STATUS.IDLE);
        this.emit("agentIdle", { agentId });
      } else {
        state.lastError = streamResult.errorSubtype ?? "Unknown error";
        this.setStatus(agentId, AGENT_STATUS.ERROR);
      }
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : "Unknown error";
      this.setStatus(agentId, AGENT_STATUS.ERROR);
      log.error({ agentId, error }, "Query execution failed");
    } finally {
      this.runningAgents.delete(agentId);
      await this.persistState();
    }
  }

  /** Inject a "btw" message into an active agent stream */
  async btwMessage(agentId: string, text: string): Promise<void> {
    const running = this.runningAgents.get(agentId);

    if (!running) {
      throw new AppError(`Agent ${agentId} is not streaming`, AppErrorCodes.AgentNotRunning);
    }

    await running.query.streamInput(
      (async function* () {
        yield {
          type: "user",
          message: { role: "user", content: text },
          parent_tool_use_id: null,
          session_id: "",
          isSynthetic: true,
          priority: "now",
        } as SDKUserMessage;
      })()
    );
  }

  /** Stop an active agent */
  async stopAgent(agentId: string): Promise<void> {
    const running = this.runningAgents.get(agentId);

    if (!running) {
      throw new AppError(`Agent ${agentId} is not streaming`, AppErrorCodes.AgentNotRunning);
    }

    running.abortController.abort();
    await running.query.interrupt();
    running.query.close();
  }

  /** Start a new session for an agent (clears current session) */
  newSession(agentId: string): void {
    const state = this.ensureState(agentId);
    state.sessionId = undefined;
    state.sessionUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalCostUsd: 0,
      contextUsed: 0,
      contextTotal: 0,
    };

    this.persistState().catch((error) => {
      log.error({ agentId, error }, "Failed to persist state after newSession");
    });
  }

  /** Cleanup when an agent is deleted */
  cleanup(agentId: string): void {
    const running = this.runningAgents.get(agentId);

    if (running) {
      running.abortController.abort();
      running.query.close();
      this.runningAgents.delete(agentId);
    }

    this.runtimeStates.delete(agentId);
    this.persistState().catch((error) => {
      log.error({ agentId, error }, "Failed to persist state after cleanup");
    });
  }

  /** Ensure a runtime state exists for the given agent */
  private ensureState(agentId: string): AgentRuntimeState {
    let state = this.runtimeStates.get(agentId);

    if (!state) {
      state = {
        agentId,
        status: AGENT_STATUS.IDLE,
        sessionUsage: {
          inputTokens: 0,
          outputTokens: 0,
          totalCostUsd: 0,
          contextUsed: 0,
          contextTotal: 0,
        },
      };
      this.runtimeStates.set(agentId, state);
    }

    return state;
  }

  /** Set agent status and emit event (bootstrap handles broadcasting) */
  private setStatus(agentId: string, status: AgentRuntimeState["status"]): void {
    const state = this.ensureState(agentId);
    state.status = status;

    this.emit("agentStatus", { agentId, status });
  }

  /** Build MCP servers for a query using registered factories */
  private buildMcpServers(agentId: string): Record<string, unknown> {
    const servers: Record<string, unknown> = {};

    for (const [name, factory] of this.mcpServerFactories) {
      servers[name] = factory(agentId);
    }

    return servers;
  }

  /** Build a peer list string for the system prompt */
  private buildPeerList(currentAgentId: string): string {
    const agents = this.registry.getAll().filter((agent) => agent.id !== currentAgentId);

    if (agents.length === 0) {
      return "";
    }

    const lines = agents.map((agent) => `- ${agent.name} (${agent.id}): ${agent.description || "No description"}`);

    return `Available peer agents:\n${lines.join("\n")}`;
  }

  /** Persist all runtime states to disk */
  private async persistState(): Promise<void> {
    const states = Array.from(this.runtimeStates.values());
    await writeJsonFile(this.stateFilePath, states);
    this.emit("stateChanged", undefined);
  }

  /** Startup recovery — resume agents based on their persisted status */
  private async runStartupRecovery(): Promise<void> {
    const agentsToResume: string[] = [];

    for (const [agentId, state] of this.runtimeStates) {
      const agentConfig = this.registry.get(agentId);

      if (!agentConfig) {
        log.warn({ agentId }, "Orphaned runtime state — agent no longer exists, cleaning up");
        this.runtimeStates.delete(agentId);

        continue;
      }

      switch (state.status) {
        case AGENT_STATUS.STREAMING:
        case AGENT_STATUS.WAITING_PERMISSION:
          // Agent was working — resume by sending "continue your work"
          agentsToResume.push(agentId);
          log.info({ agentId, status: state.status }, "Will resume agent after startup");
          break;

        case AGENT_STATUS.WAITING_AGENT:
          // Keep waitingForAgentId — will be handled after resume agents finish
          log.info({ agentId, waitingFor: state.waitingForAgentId }, "Agent waiting for peer — preserving state");
          break;

        case AGENT_STATUS.COMPACTING:
          // Compaction was interrupted — set to idle
          state.status = AGENT_STATUS.IDLE;
          log.info({ agentId }, "Reset compacting agent to idle");
          break;

        case AGENT_STATUS.ERROR:
          // Keep error state
          log.info({ agentId, error: state.lastError }, "Agent in error state — not auto-resuming");
          break;

        case AGENT_STATUS.IDLE:
          // Nothing to do
          break;
      }
    }

    // Resume streaming/waiting_permission agents
    for (const agentId of agentsToResume) {
      const state = this.ensureState(agentId);
      state.status = AGENT_STATUS.IDLE; // Reset before sendMessage validates

      // Fire-and-forget — don't block startup
      this.sendMessage(agentId, "Continue your work from where you left off.").catch((error) => {
        log.error({ agentId, error }, "Failed to resume agent on startup");
      });
    }

    // Handle waiting_agent agents whose targets are idle (not being resumed)
    for (const [agentId, state] of this.runtimeStates) {
      if (state.status !== AGENT_STATUS.WAITING_AGENT || !state.waitingForAgentId) {
        continue;
      }

      const targetIsBeingResumed = agentsToResume.includes(state.waitingForAgentId);

      if (!targetIsBeingResumed) {
        // Target was already idle — check artifacts and notify
        // This will be fully implemented in Phase 5 with artifact checking
        log.info(
          { agentId, targetId: state.waitingForAgentId },
          "Target agent was idle — will notify when artifacts are implemented"
        );
      }
    }

    await this.persistState();
  }
}
