import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import type {
  SDKUserMessage,
  CanUseTool,
  McpSdkServerConfigWithInstance,
  HookEvent,
  HookCallbackMatcher,
} from "@anthropic-ai/claude-agent-sdk";
import {
  AGENT_STATUS,
  CrowStateSchema,
  type AgentConfig,
  type AgentRuntimeState,
  type AgentStatus,
  type CrowState,
} from "@crow-central-agency/shared";
import { EventBus } from "../event-bus/event-bus.js";
import type { OrchestratorEvents, RunningAgent, McpServerFactory } from "./agent-orchestrator.types.js";
import type { AgentRegistry } from "./agent-registry.js";
import type { WsBroadcaster } from "./ws-broadcaster.js";
import type { PermissionHandler } from "./permission-handler.js";
import type { ArtifactManager } from "./artifact-manager.js";
import type { LoopScheduler } from "./loop-scheduler.js";
import type { SessionManager } from "./session-manager.js";
import { processStream } from "../stream/stream-processor.js";
import { parseToolActivity } from "../stream/tool-activity-parser.js";
import crypto from "node:crypto";
import { AppError } from "../error/app-error.js";
import { APP_ERROR_CODES } from "../error/app-error.types.js";
import { env } from "../config/env.js";
import {
  DEFAULT_PERMISSION_DENY_MESSAGE,
  ARTIFACT_TIMESTAMP_WINDOW_MS,
  ORCHESTRATOR_STATE_FILENAME,
  ORCHESTRATOR_STATE_BACKUP_FILENAME,
} from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { readJsonFile, writeJsonFile, copyFileIfExists } from "../utils/fs-utils.js";
import path from "node:path";
import type { MessageTemplate } from "../utils/message-template.types.js";
import { createMessageContentFromTemplate, getDefaultPromptContext } from "../utils/message-template.js";
import { CROW_SYSTEM_AGENT_ID } from "../agents/crow-agent.js";
import { MessageRoles } from "../model-providers/openai-provider.types.js";
import {
  ARTIFACTS_MCP_READ_ARTIFACT_TOOL_NAME,
  ARTIFACTS_MCP_WRITE_ARTIFACT_TOOL_NAME,
} from "../mcp/artifacts-mcp-server.js";
import { AGENTS_MCP_INVOKE_AGENT_TOOL_NAME } from "../mcp/agents-mcp-server.js";

const DEFAULT_SYSTEM_PROMPT: MessageTemplate = {
  role: MessageRoles.system,
  content: [
    { content: ["# Your identity", "", "Your agent ID is: {agentId}", "Your agent name is: {agentName}", ""] },
    { content: ["## Core persona", "", "{persona}", ""], keys: ["persona"] },
    {
      content: [
        "## Agent Context",
        "",
        "Avoid speculation and never fabricate data or sources. Be transparent if you do not have enough information.",
        "The current date is {currentDate}",
        "The current time is {currentTime}.",
      ],
    },
    {
      content: [
        `The following agents are available for collaboration with the "${AGENTS_MCP_INVOKE_AGENT_TOOL_NAME}" tool from the crow-agents MCP server:`,
        "{peerAgents}",
        `If a task does not fall explicitly within your own scope, check whether a peer agent is better suited and use the "${AGENTS_MCP_INVOKE_AGENT_TOOL_NAME}" tool from the crow-agents MCP server to delegate.`,
        "Do NOT attempt to perform tasks that fall under another agent's responsibility — invoke that agent instead.",
      ],
      keys: ["peerAgents"],
    },
    {
      content: ["## AGENT.md", "", "{agentMd}"],
      keys: ["agentMd"],
    },
  ],
  keys: ["currentDate", "currentTime", "agentId", "agentName", "persona", "peerAgents", "agentMd"],
};

const CROW_SYSTEM_PROMPT: MessageTemplate = {
  role: MessageRoles.system,
  content: [
    { content: ["# Your identity", "", "Your agent ID is: {agentId}", "Your agent name is: {agentName}", ""] },
    { content: ["## Core persona", "", "{persona}", ""], keys: ["persona"] },
    {
      content: ["## Agent Context", "", "The current date is {currentDate}", "The current time is {currentTime}."],
    },
    {
      content: [
        `The following agents are available for task delegation with the "${AGENTS_MCP_INVOKE_AGENT_TOOL_NAME}" tool from the crow-agents MCP server:`,
        "{peerAgents}",
      ],
      keys: ["peerAgents"],
    },
  ],
  keys: ["currentDate", "currentTime", "agentId", "agentName", "persona", "peerAgents"],
};

const INTER_AGENT_INVOKE_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        `[Agent request from "{agentName}" ({agentId})]`,
        "",
        "{task}",
        "",
        `Please perform this task and write your results to an artifact using the "${ARTIFACTS_MCP_WRITE_ARTIFACT_TOOL_NAME}" tool.`,
      ],
    },
  ],
  keys: ["agentName", "agentId", "task"],
};

const INTER_AGENT_COMPLETED_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        `[Inter-agent response: Agent "{completedAgentName}" ({completedAgentId}) has completed your requested task]`,
        "",
        `Result artifact: "{artifactFilename}"`,
        `Use ${ARTIFACTS_MCP_READ_ARTIFACT_TOOL_NAME}(agentId: "{completedAgentId}", filename: "{artifactFilename}") to retrieve the result.`,
      ],
    },
  ],
  keys: ["completedAgentId", "completedAgentName", "artifactFilename"],
};

const INTER_AGENT_COMPLETED_NORESULTS_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        `[Inter-agent response: Agent "{completedAgentName}" ({completedAgentId}) has completed your requested task, but did not produce a response artifact.]`,
      ],
    },
  ],
  keys: ["completedAgentId", "completedAgentName"],
};

/** Current version of the persisted CrowState format */
const CROW_STATE_VERSION = 1;

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
  private readonly backupFilePath: string;

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
    this.backupFilePath = path.join(env.CROW_SYSTEM_PATH, ORCHESTRATOR_STATE_BACKUP_FILENAME);
    this.listenToRegistryEvents();
    this.listenToLoopScheduler();
  }

  /** Load persisted runtime states and run startup recovery */
  public async initialize(): Promise<void> {
    // Back up previous state before recovery mutates it
    const backedUp = await copyFileIfExists(this.stateFilePath, this.backupFilePath);
    if (backedUp) {
      log.debug({ backup: this.backupFilePath }, "Backed up orchestrator state before recovery");
    }

    try {
      const raw = await readJsonFile<unknown>(this.stateFilePath);
      const result = CrowStateSchema.safeParse(raw);

      if (result.success) {
        for (const agentState of result.data.agentStates ?? []) {
          this.runtimeStates.set(agentState.agentId, agentState);
        }

        log.info({ version: result.data.version, count: this.runtimeStates.size }, "Loaded persisted runtime states");
      } else {
        log.warn({ issues: result.error.issues }, "Invalid orchestrator state file — starting fresh");
      }
    } catch (error) {
      if (error instanceof AppError && error.errorCode === APP_ERROR_CODES.NOT_FOUND) {
        log.info("No persisted runtime states found — starting fresh");
      } else {
        throw error;
      }
    }

    await this.runStartupRecovery();
  }

  /** Register a factory that creates per-agent MCP server instances */
  public registerMcpServer(name: string, factory: McpServerFactory): void {
    this.mcpServerFactories.set(name, factory);
    log.info({ name }, "MCP server factory registered");
  }

  /** Get runtime state for an agent */
  public getState(agentId: string): AgentRuntimeState | undefined {
    return this.runtimeStates.get(agentId);
  }

  /** Get all runtime states */
  public getAllStates(): AgentRuntimeState[] {
    return Array.from(this.runtimeStates.values());
  }

  /**
   * Send a message to an agent — creates an SDK query and processes the stream.
   * The agent must be idle.
   */
  public async sendMessage(agentId: string, message: string): Promise<void> {
    const agentConfig = this.registry.getAgent(agentId);
    const state = this.ensureState(agentId);

    if (state.status !== AGENT_STATUS.IDLE && state.status !== AGENT_STATUS.ERROR) {
      throw new AppError(`Agent ${agentId} is busy (status: ${state.status})`, APP_ERROR_CODES.AGENT_BUSY);
    }

    const systemPrompt = await this.buildSystemPrompt(agentId, agentConfig);
    const systemPromptOption = systemPrompt
      ? agentConfig.isReplaceSystemPrompt
        ? systemPrompt
        : { type: "preset" as const, preset: "claude_code" as const, append: systemPrompt }
      : undefined;

    // Build SDK options
    const abortController = new AbortController();
    const toolsOption = agentConfig.toolConfig.mode === "restricted" ? agentConfig.toolConfig.tools : undefined;
    const internalMcpPrefixes = [...this.mcpServerFactories.keys()].map((serverName) => `mcp__${serverName}__`);

    // Create query (mcpServers cast will be properly typed when MCP servers are implemented in Phase 5)
    const queryInstance = sdkQuery({
      prompt: message,
      options: {
        cwd: agentConfig.workspace,
        model: agentConfig.model,
        resume: state.sessionId,
        systemPrompt: systemPromptOption,
        abortController,
        includePartialMessages: true,
        permissionMode: agentConfig.permissionMode,
        allowedTools: [
          ...(agentConfig.toolConfig.autoApprovedTools || []),
          ...internalMcpPrefixes.map((prefix) => `${prefix}*`),
        ],
        tools: toolsOption,
        canUseTool: this.buildCanUseTool(agentId),
        settingSources: agentConfig.settingSources,
        mcpServers: this.buildMcpServers(agentId),
        persistSession: true,
        agentProgressSummaries: true,
        pathToClaudeCodeExecutable: env.CLAUDE_CLI_PATH,
        toolConfig: {
          askUserQuestion: { previewFormat: "html" },
        },
        hooks: this.buildSdkHooks(agentId),
      },
    });

    // Track running agent
    this.runningAgents.set(agentId, { query: queryInstance, abortController });
    this.updateAgentStatus(agentId, AGENT_STATUS.STREAMING);

    // Process stream via async generator
    let userMessageAdded = false;
    let streamSuccess = false;
    let streamErrorSubtype: string | undefined;

    try {
      for await (const event of processStream(agentId, queryInstance)) {
        // 1. Broadcast real-time WS messages (streaming text, activity hints, status)
        for (const wsMsg of event.wsMessages) {
          this.broadcaster.broadcast(wsMsg);
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
              this.broadcaster.broadcast({ type: "agent_message", agentId, message: msg });
            }

            userMessageAdded = true;
          }
        }

        // 3. Discovered tools → filter internal MCP tools, update registry
        if (event.meta?.discoveredTools && event.meta.discoveredTools.length > 0) {
          const userFacingTools = event.meta.discoveredTools.filter(
            (tool) => !internalMcpPrefixes.some((prefix) => tool.startsWith(prefix))
          );
          await this.registry.updateAgent(agentId, { availableTools: userFacingTools });
        }

        // 4. Complete assistant turn → session manager transforms, stores, returns canonical messages
        if (event.sessionMessage && state.sessionId) {
          const agentMessages = this.sessionManager.addMessage(state.sessionId, event.sessionMessage);

          for (const msg of agentMessages) {
            this.broadcaster.broadcast({ type: "agent_message", agentId, message: msg });
          }
        }

        if (event.meta?.result) {
          const resultInfo = event.meta.result;
          const inputTokens = (state.sessionUsage.inputTokens += resultInfo.inputTokens);
          const outputTokens = (state.sessionUsage.outputTokens += resultInfo.outputTokens);
          state.sessionUsage = {
            inputTokens,
            outputTokens,
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
        this.updateAgentStatus(agentId, AGENT_STATUS.IDLE);
      } else {
        state.lastError = streamErrorSubtype ?? "Stream ended without result event";
        this.updateAgentStatus(agentId, AGENT_STATUS.ERROR);
      }
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : "Unknown error";
      this.updateAgentStatus(agentId, AGENT_STATUS.ERROR);
      log.error({ agentId, error }, "Query execution failed");
    } finally {
      this.runningAgents.delete(agentId);
    }
  }

  /** Inject an user message into an active agent stream */
  public async injectMessage(agentId: string, text: string): Promise<void> {
    const running = this.runningAgents.get(agentId);

    if (!running) {
      throw new AppError(`Agent ${agentId} is not streaming`, APP_ERROR_CODES.AGENT_NOT_RUNNING);
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
  public async invokeInterAgent(sourceAgentId: string, targetAgentId: string, task: string): Promise<string> {
    const targetConfig = this.registry.getAgent(targetAgentId);
    const sourceConfig = this.registry.getAgent(sourceAgentId);
    const sourceName = sourceConfig.name;

    const taskPrompt = createMessageContentFromTemplate(
      INTER_AGENT_INVOKE_PROMPT,
      getDefaultPromptContext({
        agentId: sourceAgentId,
        agentName: sourceName,
        task,
      })
    );

    const targetState = this.ensureState(targetAgentId);
    try {
      if (targetState.status === AGENT_STATUS.IDLE || targetState.status === AGENT_STATUS.ERROR) {
        await this.sendMessage(targetAgentId, taskPrompt);
      } else {
        await this.injectMessage(targetAgentId, taskPrompt);
      }
    } catch (error) {
      log.error(
        { agentId: sourceAgentId, agentName: sourceName, targetAgentId, targetAgentName: targetConfig.name, error },
        "Failed to deliver inter-agent task"
      );
    }

    const sourceState = this.ensureState(sourceAgentId);
    sourceState.waitingForAgentId = targetAgentId;
    this.updateAgentStatus(sourceAgentId, AGENT_STATUS.WAITING_AGENT);

    log.info(
      { agentId: sourceAgentId, agentName: sourceName, targetAgentId, targetAgentName: targetConfig.name },
      "Inter-agent invocation started"
    );
    return `Task sent to agent "${targetConfig.name}" (${targetAgentId}). The agent is working on it and you will be notified when the result is ready.`;
  }

  /** Stop an active agent */
  public async stopAgent(agentId: string): Promise<void> {
    const running = this.runningAgents.get(agentId);

    if (!running) {
      throw new AppError(`Agent ${agentId} is not streaming`, APP_ERROR_CODES.AGENT_NOT_RUNNING);
    }

    this.permissionHandler.cancelAllForAgent(agentId);
    running.abortController.abort();
    await running.query.interrupt();
    running.query.close();
  }

  /** Start a new session for an agent (clears current session) */
  public async newSession(agentId: string): Promise<void> {
    const state = this.ensureState(agentId);
    state.sessionId = undefined;
    state.sessionUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalCostUsd: 0,
      contextUsed: 0,
      contextTotal: 0,
    };

    try {
      await this.persistState();
    } catch (error) {
      log.error({ agentId, error }, "Failed to persist state after newSession");
    }
  }

  /** Cleanup when an agent is deleted — triggered by registry agentDeleted event */
  private async cleanup(agentId: string): Promise<void> {
    this.permissionHandler.cancelAllForAgent(agentId);
    const running = this.runningAgents.get(agentId);

    if (running) {
      running.abortController.abort();
      running.query.close();
      this.runningAgents.delete(agentId);
    }

    this.runtimeStates.delete(agentId);

    try {
      await this.persistState();
    } catch (error) {
      log.error({ agentId, error }, "Failed to persist state after cleanup");
    }
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
  private async updateAgentStatus(agentId: string, status: AgentStatus): Promise<void> {
    const state = this.ensureState(agentId);
    if (state.status === status) {
      return;
    }

    state.status = status;
    log.info({ agentId, status }, "Agent status changed.");
    await this.persistState();

    // status changed handlers
    if (status === AGENT_STATUS.IDLE) {
      await this.notifyWaitingAgents(agentId);
    }

    this.broadcaster.broadcast({
      type: "agent_status",
      agentId,
      status,
    });
    this.emit("agentStateChanged", { agentId, status });
  }

  /** Notify agents that were waiting for the given agent to complete */
  private async notifyWaitingAgents(completedAgentId: string): Promise<void> {
    for (const [agentId, state] of this.runtimeStates) {
      if (state.waitingForAgentId !== completedAgentId) {
        continue;
      }

      const waitingAgentId = agentId;
      state.waitingForAgentId = undefined;
      let targetName: string;

      try {
        targetName = this.registry.getAgent(completedAgentId).name;
      } catch {
        log.warn(
          { agentId: completedAgentId, waitingAgentId },
          "Completed agent no longer exists — skipping notification"
        );
        continue;
      }

      try {
        const recentArtifact = await this.artifactManager.getMostRecentArtifact(completedAgentId);
        const isRecent =
          recentArtifact !== undefined &&
          Date.now() - new Date(recentArtifact.updatedAt).getTime() <= ARTIFACT_TIMESTAMP_WINDOW_MS;

        const notificationPrompt = createMessageContentFromTemplate(
          isRecent && recentArtifact ? INTER_AGENT_COMPLETED_PROMPT : INTER_AGENT_COMPLETED_NORESULTS_PROMPT,
          getDefaultPromptContext({
            completedAgentId,
            completedAgentName: targetName,
            artifactFilename: recentArtifact?.filename,
          })
        );

        const running = this.runningAgents.get(waitingAgentId);
        if (running) {
          await this.injectMessage(waitingAgentId, notificationPrompt);
        } else {
          await this.sendMessage(waitingAgentId, notificationPrompt);
        }

        log.info({ agentId: completedAgentId, waitingAgentId }, "Notifying waiting agent");
      } catch (error) {
        log.error({ agentId: completedAgentId, waitingAgentId, error }, "Failed to notify waiting agent");
      }
    }
  }

  /** Build canUseTool callback that bridges SDK permission requests to our PermissionHandler */
  private buildCanUseTool(agentId: string): CanUseTool {
    const handler = this.permissionHandler;

    return async (toolName, input, options) => {
      this.updateAgentStatus(agentId, AGENT_STATUS.WAITING_PERMISSION);

      const result = await handler.requestPermission(
        agentId,
        toolName,
        input,
        options.toolUseID,
        options.decisionReason
      );

      // Restore to streaming after permission is resolved
      this.updateAgentStatus(agentId, AGENT_STATUS.STREAMING);

      if (result.behavior === "allow") {
        return { behavior: "allow" as const, updatedInput: result.updatedInput || input, toolUseID: options.toolUseID };
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

  /**
   * Build SDK hooks to capture subagent lifecycle events.
   * Broadcasts agent_activity WS messages when subagents start, stop, or use tools.
   */
  private buildSdkHooks(agentId: string): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
    const broadcastActivity = (description: string, toolName: string) => {
      this.broadcaster.broadcast({
        type: "agent_activity",
        agentId,
        toolName,
        description,
      });
    };

    return {
      SubagentStart: [
        {
          hooks: [
            async (input) => {
              try {
                if (input.hook_event_name === "SubagentStart") {
                  broadcastActivity(`Subagent started: ${input.agent_type}`, "Agent");
                }
              } catch (error) {
                log.warn({ agentId, error }, "SubagentStart hook broadcast failed");
              }

              return { continue: true };
            },
          ],
        },
      ],
      SubagentStop: [
        {
          hooks: [
            async (input) => {
              try {
                if (input.hook_event_name === "SubagentStop") {
                  broadcastActivity(`Subagent completed: ${input.agent_type}`, "Agent");
                }
              } catch (error) {
                log.warn({ agentId, error }, "SubagentStop hook broadcast failed");
              }

              return { continue: true };
            },
          ],
        },
      ],
      PreToolUse: [
        {
          hooks: [
            async (input) => {
              try {
                // Only broadcast for subagent tool use (has agent_id on the input)
                if (input.hook_event_name === "PreToolUse" && input.agent_id) {
                  const description = parseToolActivity(input.tool_name, input.tool_input);
                  broadcastActivity(`Subagent: ${description}`, input.tool_name);
                }
              } catch (error) {
                log.warn({ agentId, error }, "PreToolUse hook broadcast failed");
              }

              return { continue: true };
            },
          ],
        },
      ],
    };
  }

  /** Persist all runtime states to disk */
  private async persistState(): Promise<void> {
    const crowState: CrowState = {
      version: CROW_STATE_VERSION,
      agentStates: Array.from(this.runtimeStates.values()),
    };
    await writeJsonFile(this.stateFilePath, crowState);
  }

  /** Startup recovery — resume agents based on their persisted status */
  private async runStartupRecovery(): Promise<void> {
    const agentsToResume: string[] = [];

    for (const [agentId, state] of this.runtimeStates) {
      try {
        this.registry.getAgent(agentId);
      } catch {
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
        await this.notifyWaitingAgents(state.waitingForAgentId);
      }
    }

    await this.persistState();
  }

  /** Listen to registry lifecycle events for cleanup */
  private listenToRegistryEvents(): void {
    this.registry.on("agentDeleted", async ({ agentId }) => {
      await this.cleanup(agentId);
    });
  }

  /** Listen to loop scheduler ticks and send scheduled prompts */
  private listenToLoopScheduler(): void {
    this.loopScheduler.on("loopTick", ({ agentId, prompt }) => {
      this.sendMessage(agentId, prompt).catch((error) => {
        if (error instanceof AppError && error.errorCode === APP_ERROR_CODES.AGENT_BUSY) {
          log.debug({ agentId }, "Loop tick skipped — agent is busy");
          return;
        }

        log.error({ agentId, error }, "Loop tick failed");
      });
    });
  }

  private async buildSystemPrompt(agentId: string, agent: AgentConfig): Promise<string> {
    const agentMd = await this.registry.getAgentMd(agentId);
    const peerAgents = this.registry
      .getAllAgents()
      .filter((peer) => peer.id !== agentId)
      .map((peer) => {
        const parts = [`Agent ID: ${peer.id}`, `Name: ${peer.name}`];
        if (peer.description) {
          parts.push(`Description: ${peer.description}`);
        }

        return `- ${parts.join(", ")}`;
      })
      .join("\n");

    const content = createMessageContentFromTemplate(
      agentId === CROW_SYSTEM_AGENT_ID ? CROW_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT,
      getDefaultPromptContext({
        agentId: agent.id,
        agentName: agent.name,
        persona: agent.persona || undefined,
        peerAgents: peerAgents || undefined,
        agentMd: agentMd || undefined,
      })
    );

    return content;
  }
}
