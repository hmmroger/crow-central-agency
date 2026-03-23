import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import type { SDKUserMessage, CanUseTool, McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { AGENT_STATUS, AgentRuntimeStateSchema, type AgentRuntimeState } from "@crow-central-agency/shared";
import { EventBus } from "../event-bus/event-bus.js";
import type { OrchestratorEvents, RunningAgent, McpServerFactory } from "./agent-orchestrator.types.js";
import type { AgentRegistry } from "./agent-registry.js";
import type { WsBroadcaster } from "./ws-broadcaster.js";
import type { PermissionHandler } from "./permission-handler.js";
import type { ArtifactManager } from "./artifact-manager.js";
import type { LoopScheduler } from "./loop-scheduler.js";
import type { SessionManager } from "./session-manager.js";
import { processStream } from "../stream/stream-processor.js";
import crypto from "node:crypto";
import { AppError } from "../error/app-error.js";
import { AppErrorCodes } from "../error/app-error.types.js";
import { env } from "../config/env.js";
import {
  DEFAULT_PERMISSION_DENY_MESSAGE,
  ARTIFACT_TIMESTAMP_WINDOW_MS,
  ORCHESTRATOR_STATE_FILENAME,
} from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { readJsonFile, writeJsonFile } from "../utils/fs-utils.js";
import path from "node:path";

const log = logger.child({ context: "orchestrator" });

/**
 * Agent orchestrator — central state machine that owns agent runtimes.
 * Creates SDK queries, processes streams, coordinates lifecycle, persists state.
 * Owns all its dependencies — broadcasts directly, listens to registry/loopScheduler events internally.
 */
export class AgentOrchestrator extends EventBus<OrchestratorEvents> {
  private runningAgents = new Map<string, RunningAgent>();
  private runtimeStates = new Map<string, AgentRuntimeState>();
  private mcpServerFactories = new Map<string, McpServerFactory>();
  private readonly stateFilePath: string;

  constructor(
    private readonly registry: AgentRegistry,
    private readonly broadcaster: WsBroadcaster,
    private readonly permissionHandler: PermissionHandler,
    private readonly artifactManager: ArtifactManager,
    private readonly loopScheduler: LoopScheduler,
    private readonly sessionManager: SessionManager
  ) {
    super();
    this.stateFilePath = path.join(env.CROW_SYSTEM_PATH, ORCHESTRATOR_STATE_FILENAME);
    this.listenToRegistryEvents();
    this.listenToLoopScheduler();
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

    // Create query (mcpServers cast will be properly typed when MCP servers are implemented in Phase 5)
    const queryInstance = sdkQuery({
      prompt: message,
      options: {
        cwd: agentConfig.workspace,
        model: agentConfig.model,
        resume: state.sessionId,
        systemPrompt: appendPrompt
          ? { type: "preset" as const, preset: "claude_code" as const, append: appendPrompt }
          : { type: "preset" as const, preset: "claude_code" as const },
        abortController,
        includePartialMessages: true,
        permissionMode: agentConfig.permissionMode,
        allowedTools: agentConfig.toolConfig.autoApprovedTools,
        tools: toolsOption,
        canUseTool: this.buildCanUseTool(agentId),
        settingSources: agentConfig.settingSources,
        mcpServers: this.buildMcpServers(agentId),
        persistSession: true,
        agentProgressSummaries: true,
        pathToClaudeCodeExecutable: env.CLAUDE_CLI_PATH,
      },
    });

    // Track running agent
    this.runningAgents.set(agentId, { query: queryInstance, abortController });
    this.setStatus(agentId, AGENT_STATUS.STREAMING);

    // Process stream via async generator
    let userMessageAdded = false;
    let streamSuccess = false;
    let streamErrorSubtype: string | undefined;

    try {
      for await (const event of processStream(agentId, queryInstance)) {
        // 1. Broadcast real-time WS messages (streaming text, activity hints, status)
        for (const wsMsg of event.wsMessages) {
          this.broadcaster.broadcast(agentId, wsMsg);
        }

        // 2. Capture sessionId from init → add user message as SessionMessage
        if (event.meta?.sessionId) {
          state.sessionId = event.meta.sessionId;

          if (!userMessageAdded) {
            const userSessionMsg = {
              type: "user" as const,
              uuid: crypto.randomUUID(),
              session_id: event.meta.sessionId,
              message: { role: "user", content: message },
              parent_tool_use_id: null,
            };
            const userMessages = this.sessionManager.addMessage(event.meta.sessionId, userSessionMsg);

            for (const msg of userMessages) {
              this.broadcaster.broadcast(agentId, { type: "agent_message", agentId, message: msg });
            }

            userMessageAdded = true;
          }
        }

        // 3. Discovered tools → filter internal MCP tools, update registry
        if (event.meta?.discoveredTools && event.meta.discoveredTools.length > 0) {
          const internalMcpPrefixes = [...this.mcpServerFactories.keys()].map((serverName) => `mcp__${serverName}__`);
          const userFacingTools = event.meta.discoveredTools.filter(
            (tool) => !internalMcpPrefixes.some((prefix) => tool.startsWith(prefix))
          );
          await this.registry.update(agentId, { availableTools: userFacingTools });
        }

        // 4. Complete assistant turn → session manager transforms, stores, returns canonical messages
        if (event.sessionMessage && state.sessionId) {
          const agentMessages = this.sessionManager.addMessage(state.sessionId, event.sessionMessage);

          for (const msg of agentMessages) {
            this.broadcaster.broadcast(agentId, { type: "agent_message", agentId, message: msg });
          }
        }

        // 5. Per-turn usage accumulation
        if (event.meta?.usage) {
          state.sessionUsage.inputTokens += event.meta.usage.inputTokens;
          state.sessionUsage.outputTokens += event.meta.usage.outputTokens;
        }

        // 6. Result → update session usage with final totals
        if (event.meta?.result) {
          const resultInfo = event.meta.result;
          state.sessionUsage = {
            inputTokens: state.sessionUsage.inputTokens,
            outputTokens: state.sessionUsage.outputTokens,
            totalCostUsd: resultInfo.totalCostUsd,
            contextUsed: resultInfo.contextUsed ?? state.sessionUsage.contextUsed,
            contextTotal: resultInfo.contextTotal ?? state.sessionUsage.contextTotal,
          };
          streamSuccess = resultInfo.success;
          streamErrorSubtype = resultInfo.success ? undefined : resultInfo.subtype;
        }
      }

      if (streamSuccess) {
        state.lastError = undefined;
        this.setStatus(agentId, AGENT_STATUS.IDLE);
        this.notifyWaitingAgents(agentId);
      } else {
        state.lastError = streamErrorSubtype ?? "Stream ended without result event";
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

  /**
   * Handle inter-agent invocation: deliver task to target, mark source as waiting.
   * Called from crow-agents MCP tool.
   */
  async invokeInterAgent(sourceAgentId: string, targetAgentId: string, task: string): Promise<void> {
    const targetConfig = this.registry.get(targetAgentId);

    if (!targetConfig) {
      throw new AppError(`Target agent not found: ${targetAgentId}`, AppErrorCodes.AgentNotFound);
    }

    const sourceConfig = this.registry.get(sourceAgentId);
    const sourceName = sourceConfig?.name ?? sourceAgentId;

    const taskPrompt = [
      `[Inter-agent request from "${sourceName}" (id: ${sourceAgentId})]`,
      "",
      task,
      "",
      "Write any output to your artifacts folder so the requesting agent can retrieve them.",
    ].join("\n");

    const targetState = this.ensureState(targetAgentId);

    if (targetState.status === AGENT_STATUS.IDLE || targetState.status === AGENT_STATUS.ERROR) {
      this.sendMessage(targetAgentId, taskPrompt).catch((error) => {
        log.error({ sourceAgentId, targetAgentId, error }, "Failed to deliver inter-agent task");
      });
    } else {
      await this.btwMessage(targetAgentId, taskPrompt);
    }

    const sourceState = this.ensureState(sourceAgentId);
    sourceState.waitingForAgentId = targetAgentId;
    this.setStatus(sourceAgentId, AGENT_STATUS.WAITING_AGENT);
    await this.persistState();

    log.info({ sourceAgentId, targetAgentId }, "Inter-agent invocation started");
  }

  /** Stop an active agent */
  async stopAgent(agentId: string): Promise<void> {
    const running = this.runningAgents.get(agentId);

    if (!running) {
      throw new AppError(`Agent ${agentId} is not streaming`, AppErrorCodes.AgentNotRunning);
    }

    this.permissionHandler.cancelAllForAgent(agentId);
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

  /** Cleanup when an agent is deleted — triggered by registry agentDeleted event */
  private cleanup(agentId: string): void {
    this.permissionHandler.cancelAllForAgent(agentId);
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

  /** Set agent status — broadcasts to WS clients and emits lifecycle event */
  private setStatus(agentId: string, status: AgentRuntimeState["status"]): void {
    const state = this.ensureState(agentId);
    state.status = status;

    this.broadcaster.broadcast(agentId, {
      type: "agent_status",
      agentId,
      status,
    });
    this.emit("agentStateChanged", { agentId, status });
  }

  /** Notify agents that were waiting for the given agent to complete */
  private notifyWaitingAgents(completedAgentId: string): void {
    for (const [agentId, state] of this.runtimeStates) {
      if (state.waitingForAgentId !== completedAgentId) {
        continue;
      }

      state.waitingForAgentId = undefined;
      const targetConfig = this.registry.get(completedAgentId);
      const targetName = targetConfig?.name ?? completedAgentId;

      const notifyWithArtifact = async () => {
        let notificationPrompt: string;
        const recentArtifact = await this.artifactManager.getMostRecentArtifact(completedAgentId);
        const isRecent =
          recentArtifact !== undefined &&
          Date.now() - new Date(recentArtifact.updatedAt).getTime() <= ARTIFACT_TIMESTAMP_WINDOW_MS;

        if (isRecent && recentArtifact) {
          notificationPrompt = [
            `[Inter-agent response: Agent "${targetName}" has completed your requested task]`,
            "",
            `Result artifact: "${recentArtifact.filename}"`,
            `Use read_artifact(agentId: "${completedAgentId}", filename: "${recentArtifact.filename}") to retrieve the result.`,
          ].join("\n");
        } else {
          notificationPrompt = `[Inter-agent response: Agent "${targetName}" has completed your requested task, but did not produce a response artifact.]`;
        }

        const running = this.runningAgents.get(agentId);

        if (running) {
          await this.btwMessage(agentId, notificationPrompt);
        } else {
          this.sendMessage(agentId, notificationPrompt).catch((error) => {
            log.error({ agentId, error }, "Failed to notify waiting agent");
          });
        }
      };

      notifyWithArtifact().catch((error) => {
        log.error({ agentId, completedAgentId, error }, "Failed to notify waiting agent with artifact check");
      });

      log.info({ waitingAgentId: agentId, completedAgentId }, "Notifying waiting agent");
    }
  }

  /** Build canUseTool callback that bridges SDK permission requests to our PermissionHandler */
  private buildCanUseTool(agentId: string): CanUseTool {
    const handler = this.permissionHandler;

    return async (toolName, input, options) => {
      this.setStatus(agentId, AGENT_STATUS.WAITING_PERMISSION);

      const result = await handler.requestPermission(
        agentId,
        toolName,
        input,
        options.toolUseID,
        options.decisionReason
      );

      // Restore to streaming after permission is resolved
      this.setStatus(agentId, AGENT_STATUS.STREAMING);

      if (result.behavior === "allow") {
        return { behavior: "allow" as const, updatedInput: result.updatedInput, toolUseID: options.toolUseID };
      }

      return {
        behavior: "deny" as const,
        message: result.message ?? DEFAULT_PERMISSION_DENY_MESSAGE,
        toolUseID: options.toolUseID,
      };
    };
  }

  /** Build MCP servers for a query using registered factories */
  private buildMcpServers(agentId: string): Record<string, McpSdkServerConfigWithInstance> {
    const servers: Record<string, McpSdkServerConfigWithInstance> = {};

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
    for (const [_agentId, state] of this.runtimeStates) {
      if (state.status !== AGENT_STATUS.WAITING_AGENT || !state.waitingForAgentId) {
        continue;
      }

      const targetIsBeingResumed = agentsToResume.includes(state.waitingForAgentId);

      if (!targetIsBeingResumed) {
        // Target was already idle — notify waiting agent with artifact check
        this.notifyWaitingAgents(state.waitingForAgentId);
      }
    }

    await this.persistState();
  }

  /** Listen to registry lifecycle events for cleanup */
  private listenToRegistryEvents(): void {
    this.registry.on("agentDeleted", ({ agentId }) => {
      this.cleanup(agentId);
    });
  }

  /** Listen to loop scheduler ticks and send scheduled prompts */
  private listenToLoopScheduler(): void {
    this.loopScheduler.on("loopTick", ({ agentId, prompt }) => {
      this.sendMessage(agentId, prompt).catch((error) => {
        if (error instanceof AppError && error.errorCode === AppErrorCodes.AgentBusy) {
          log.debug({ agentId }, "Loop tick skipped — agent is busy");

          return;
        }

        log.error({ agentId, error }, "Loop tick failed");
      });
    });
  }
}
