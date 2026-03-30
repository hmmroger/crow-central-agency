import type { SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  AGENT_STATUS,
  AGENT_TASK_SOURCE_TYPE,
  AGENT_TASK_STATE,
  CrowStateSchema,
  SERVER_MESSAGE_TYPE,
  type AgentRuntimeState,
  type AgentStatus,
  type AgentTaskItem,
  type AgentTaskState,
  type CrowState,
} from "@crow-central-agency/shared";
import type { AgentRegistry } from "./agent-registry.js";
import type { WsBroadcaster } from "./ws-broadcaster.js";
import type { PermissionHandler } from "./permission-handler.js";
import type { ArtifactManager } from "./artifact-manager.js";
import type { SessionManager } from "./session-manager.js";
import type { MessageQueueManager } from "./message-queue-manager.js";
import { MESSAGE_SOURCE_TYPE, type MessageSource } from "./message-queue-manager.types.js";
import crypto from "node:crypto";
import { AppError } from "../error/app-error.js";
import { APP_ERROR_CODES } from "../error/app-error.types.js";
import { env } from "../config/env.js";
import {
  ARTIFACT_TIMESTAMP_WINDOW_MS,
  ORCHESTRATOR_STATE_FILENAME,
  ORCHESTRATOR_STATE_BACKUP_FILENAME,
} from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { readJsonFile, writeJsonFile, copyFileIfExists } from "../utils/fs-utils.js";
import path from "node:path";
import type { MessageTemplate } from "../utils/message-template.types.js";
import { createMessageContentFromTemplate, getDefaultPromptContext } from "../utils/message-template.js";
import { MessageRoles } from "../model-providers/openai-provider.types.js";
import { ARTIFACTS_MCP_READ_ARTIFACT_TOOL_NAME } from "../mcp/artifacts-mcp-server.js";
import { AgentRunner } from "../runner/agent-runner.js";
import { AGENT_STREAM_EVENT_TYPE, type PermissionRequestCallback } from "../runner/agent-runner.types.js";
import type { CrowMcpManager } from "../mcp/crow-mcp-manager.js";
import type { AgentTaskManager } from "./agent-task-manager.js";
import { head } from "es-toolkit";

const TASK_COMPLETED_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        `[Task completed: Agent "{agentName}" ({agentId}) has completed your requested task]`,
        "",
        `Result artifact: "{artifactFilename}"`,
        `Use ${ARTIFACTS_MCP_READ_ARTIFACT_TOOL_NAME}(agentId: "{agentId}", filename: "{artifactFilename}") to retrieve the result.`,
      ],
    },
  ],
  keys: ["agentId", "agentName", "artifactFilename"],
};

const TASK_COMPLETED_NO_ARTIFACT_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        `[Task completed: Agent "{agentName}" ({agentId}) has completed your requested task, but did not produce a response artifact.]`,
      ],
    },
  ],
  keys: ["agentId", "agentName"],
};

const TASK_INCOMPLETE_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        `[Task interrupted: Agent "{agentName}" ({agentId}) was unable to complete your requested task. The task was interrupted or encountered an error.]`,
      ],
    },
  ],
  keys: ["agentId", "agentName"],
};

/** Current version of the persisted CrowState format */
const CROW_STATE_VERSION = 1;

const log = logger.child({ context: "orchestrator" });

/**
 * Agent orchestrator — central state machine that owns agent runtimes.
 * Creates SDK queries, processes streams, coordinates lifecycle, persists state.
 * Owns all its dependencies — broadcasts directly, listens to registry/taskManager events internally.
 */
export class AgentOrchestrator {
  private agentRunners = new Map<string, AgentRunner>();
  private runtimeStates = new Map<string, AgentRuntimeState>();
  private readonly stateFilePath: string;
  private readonly backupFilePath: string;

  constructor(
    private readonly registry: AgentRegistry,
    private readonly mcpManager: CrowMcpManager,
    private readonly broadcaster: WsBroadcaster,
    private readonly permissionHandler: PermissionHandler,
    private readonly artifactManager: ArtifactManager,
    private readonly sessionManager: SessionManager,
    private readonly messageQueue: MessageQueueManager,
    private readonly taskManager: AgentTaskManager
  ) {
    this.stateFilePath = path.join(env.CROW_SYSTEM_PATH, ORCHESTRATOR_STATE_FILENAME);
    this.backupFilePath = path.join(env.CROW_SYSTEM_PATH, ORCHESTRATOR_STATE_BACKUP_FILENAME);
    this.listenToRegistryEvents();
    this.taskManager.on("taskAssigned", ({ task }) => this.onTaskAssigned(task));
    this.taskManager.on("taskStateChanged", ({ task, previousState }) => this.onTaskStateChanged(task, previousState));
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

    const agents = this.registry.getAllAgents();
    for (const agent of agents) {
      const runner = this.createAgentRunner(agent.id);
      this.agentRunners.set(agent.id, runner);
    }

    await this.runStartupRecovery();
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
   * If the agent is busy, the message is transparently enqueued and processed
   * when the agent becomes idle.
   */
  public async sendMessage(
    agentId: string,
    message: string,
    source: MessageSource = { sourceType: MESSAGE_SOURCE_TYPE.USER }
  ): Promise<void> {
    const state = this.ensureState(agentId);
    const agentRunner = this.getAgentRunner(agentId);

    if (agentRunner.getAgentStatus() !== AGENT_STATUS.IDLE) {
      await this.messageQueue.enqueue(agentId, message, source);
      return;
    }

    await this.runAgent(agentId, message, state, source);
  }

  /**
   * Inject a message into an active agent stream.
   */
  public injectMessage(agentId: string, text: string): void {
    const agentRunner = this.getAgentRunner(agentId);
    agentRunner.injectMessage(text);
  }

  /** Stop an active agent */
  public async stopAgent(agentId: string): Promise<void> {
    const agentRunner = this.getAgentRunner(agentId);
    await agentRunner.abort();
  }

  /** Start a new session for an agent (clears current session, message queue, and injected messages) */
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

    await this.messageQueue.clear(agentId);

    try {
      await this.persistState();
    } catch (error) {
      log.error({ agentId, error }, "Failed to persist state after newSession");
    }
  }

  private async runAgent(
    agentId: string,
    message: string,
    state: AgentRuntimeState,
    source: MessageSource
  ): Promise<void> {
    const agentRunner = this.getAgentRunner(agentId);

    // Process stream via async generator
    let userMessageAdded = false;
    let isAbortedOrError = false;
    try {
      const eventStream = agentRunner.sendMessage(message, state.sessionId);
      for await (const event of eventStream) {
        switch (event.type) {
          case AGENT_STREAM_EVENT_TYPE.INIT:
            state.sessionId = event.sessionId;
            if (!userMessageAdded) {
              const userSessionMsg: SessionMessage = {
                type: "user",
                uuid: crypto.randomUUID(),
                session_id: event.sessionId,
                message: { role: "user", content: message },
                parent_tool_use_id: null,
              };
              const userMessages = this.sessionManager.addMessage(event.sessionId, userSessionMsg);

              for (const msg of userMessages) {
                this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.AGENT_MESSAGE, agentId, message: msg });
              }

              userMessageAdded = true;
            }

            // 3. Discovered tools → filter internal MCP tools, update registry
            if (event.discoveredTools && event.discoveredTools.length > 0) {
              await this.registry.updateAgent(agentId, { availableTools: event.discoveredTools });
            }

            await this.persistState();
            break;

          case AGENT_STREAM_EVENT_TYPE.MESSAGE_DONE: {
            const sessionMessage: SessionMessage = {
              type: "assistant",
              uuid: event.messageId,
              session_id: event.sessionId,
              message: event.message,
              parent_tool_use_id: null,
            };

            const agentMessages = this.sessionManager.addMessage(event.sessionId, sessionMessage);
            for (const msg of agentMessages) {
              this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.AGENT_MESSAGE, agentId, message: msg });
            }

            break;
          }

          case AGENT_STREAM_EVENT_TYPE.CONTENT:
            this.broadcaster.broadcast({
              type: SERVER_MESSAGE_TYPE.AGENT_TEXT,
              agentId,
              text: event.content,
            });

            break;

          case AGENT_STREAM_EVENT_TYPE.THINKING:
            // TODO
            break;

          case AGENT_STREAM_EVENT_TYPE.TOOL_USE:
            this.broadcaster.broadcast({
              type: SERVER_MESSAGE_TYPE.AGENT_ACTIVITY,
              agentId,
              toolName: event.toolName,
              description: event.description,
            });

            break;

          case AGENT_STREAM_EVENT_TYPE.TOOL_USE_PROGRESS:
            this.broadcaster.broadcast({
              type: SERVER_MESSAGE_TYPE.AGENT_TOOL_PROGRESS,
              agentId,
              toolName: event.toolName,
              elapsedTimeSeconds: event.elapsedTimeSeconds,
            });
            break;

          case AGENT_STREAM_EVENT_TYPE.STATUS:
            this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.AGENT_STATUS, agentId, status: event.status });
            break;

          case AGENT_STREAM_EVENT_TYPE.RATE_LIMIT_INFO:
            if (event.rateLimitStatus === "rejected") {
              log.warn({ agentId, rateLimitType: event.rateLimitType }, "Rate limited.");
            }

            break;

          case AGENT_STREAM_EVENT_TYPE.DONE: {
            const inputTokens = event.usage?.inputTokens ?? 0;
            const outputTokens = event.usage?.outputTokens ?? 0;
            const totalCostUsd = event.usage?.totalCostUsd ?? 0;
            this.broadcaster.broadcast({
              type: SERVER_MESSAGE_TYPE.AGENT_RESULT,
              agentId,
              subtype: event.doneType,
              totalCostUsd,
              durationMs: event.durationMs,
            });
            this.broadcaster.broadcast({
              type: SERVER_MESSAGE_TYPE.AGENT_USAGE,
              agentId,
              inputTokens,
              outputTokens,
              totalCostUsd,
              contextTotal: event.usage?.contextTotal ?? 0,
              contextUsed: event.usage?.contextUsed ?? 0,
            });

            const sessionInputTokens = (state.sessionUsage.inputTokens += inputTokens);
            const sessionOutputTokens = (state.sessionUsage.outputTokens += outputTokens);
            state.sessionUsage = {
              inputTokens: sessionInputTokens,
              outputTokens: sessionOutputTokens,
              totalCostUsd,
              contextUsed: event.usage?.contextUsed ?? state.sessionUsage.contextUsed,
              contextTotal: event.usage?.contextTotal ?? state.sessionUsage.contextTotal,
            };
            break;
          }

          case AGENT_STREAM_EVENT_TYPE.ABORTED:
            isAbortedOrError = true;
            break;

          case AGENT_STREAM_EVENT_TYPE.ERROR:
            isAbortedOrError = true;
            state.lastError = event.error;
            this.broadcaster.broadcast({
              type: SERVER_MESSAGE_TYPE.ERROR,
              agentId,
              code: APP_ERROR_CODES.SDK_ERROR,
              message: event.error,
            });
            break;
        }
      }

      // Source sepecific handling
      if (source.sourceType === MESSAGE_SOURCE_TYPE.TASK) {
        const task = this.taskManager.getTask(source.taskId);
        if (task) {
          await this.taskManager.updateTaskState(
            task.id,
            isAbortedOrError ? AGENT_TASK_STATE.INCOMPLETE : AGENT_TASK_STATE.COMPLETED
          );
        }
      }
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : "Unknown error";
      log.error({ agentId, error }, "Run agent execution failed");
    }
  }

  /** Cleanup when an agent is deleted — triggered by registry agentDeleted event */
  private async cleanup(agentId: string): Promise<void> {
    this.permissionHandler.cancelAllForAgent(agentId);

    const agentRunner = this.getAgentRunner(agentId);
    await agentRunner.abort();
    this.agentRunners.delete(agentId);

    this.runtimeStates.delete(agentId);
    await this.messageQueue.clear(agentId);

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

  /**
   * Drain the next queued message for an agent.
   * Called when an agent finishing query and returning control to caller or on initialization.
   *
   * Uses dequeue-before-send (at-most-once): if sendMessage fails after dequeue,
   * that single message is lost. This is acceptable because the same message would
   * likely fail again on retry.
   */
  private async drainQueue(agentId: string): Promise<void> {
    const next = await this.messageQueue.dequeue(agentId);
    if (!next) {
      return;
    }

    log.info({ agentId, queueEntryId: next.id, source: next.source }, "Draining queued message");
    this.sendMessage(agentId, next.message, next.source).catch((error) => {
      log.error({ agentId, queueEntryId: next.id, error }, "Failed to process drained message");
    });
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

      // Clear stale pending permissions — SDK callbacks no longer exist after restart
      if (state.pendingPermissions?.length) {
        log.info({ agentId, count: state.pendingPermissions.length }, "Clearing stale pending permissions");
        state.pendingPermissions = undefined;
      }

      switch (state.status) {
        case AGENT_STATUS.STREAMING:
          // Agent was working — resume by sending "continue your work"
          agentsToResume.push(agentId);
          log.info({ agentId, status: state.status }, "Will resume agent after startup");
          break;

        case AGENT_STATUS.COMPACTING:
          // Compaction was interrupted — set to idle
          state.status = AGENT_STATUS.IDLE;
          log.info({ agentId }, "Reset compacting agent to idle");
          break;

        case AGENT_STATUS.IDLE:
          // Nothing to do
          break;
      }
    }

    // Resume streaming agents
    for (const agentId of agentsToResume) {
      const state = this.ensureState(agentId);
      state.status = AGENT_STATUS.IDLE;

      let messageSource: MessageSource = {
        sourceType: MESSAGE_SOURCE_TYPE.RECOVERY,
      };
      const activeTasks = this.taskManager
        .getTasksByOwner(agentId)
        .filter((task) => task.state === AGENT_TASK_STATE.ACTIVE);
      const firstTask = head(activeTasks);
      if (firstTask) {
        messageSource = { sourceType: MESSAGE_SOURCE_TYPE.TASK, taskId: firstTask.id };
        const otherActiveTasks = activeTasks.slice(1);
        for (const task of otherActiveTasks) {
          await this.taskManager.updateTaskState(task.id, AGENT_TASK_STATE.OPEN);
        }
      }

      // Fire-and-forget — don't block startup
      this.sendMessage(agentId, "Continue your work from where you left off.", messageSource).catch((error) => {
        log.error({ agentId, error }, "Failed to resume agent on startup");
      });
    }

    await this.persistState();

    // Drain persisted queues for agents that are idle after recovery
    for (const [agentId, state] of this.runtimeStates) {
      if (state.status === AGENT_STATUS.IDLE) {
        this.drainQueue(agentId).catch((error) => {
          log.error({ agentId, error }, "Queue drain failed during startup recovery");
        });
      }
    }
  }

  /** Listen to registry lifecycle events for cleanup */
  private listenToRegistryEvents(): void {
    this.registry.on("agentDeleted", async ({ agentId }) => {
      await this.cleanup(agentId);
    });
  }

  private async onAgentStatusChanged(agentId: string, status: AgentStatus): Promise<void> {
    this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.AGENT_STATUS, agentId, status });
    if (status !== AGENT_STATUS.IDLE) {
      return;
    }

    this.drainQueue(agentId).catch((error) => {
      log.error({ agentId, error }, "Queue drain failed");
    });

    await this.scheduleTask(agentId);
  }

  private async onTaskAssigned(task: AgentTaskItem): Promise<void> {
    const assignedAgentId =
      task.ownerSource?.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT ? task.ownerSource.agentId : undefined;
    if (!assignedAgentId) {
      return;
    }

    await this.scheduleTask(assignedAgentId);
  }

  private async onTaskStateChanged(task: AgentTaskItem, _previousState: AgentTaskState): Promise<void> {
    if (task.state !== AGENT_TASK_STATE.COMPLETED && task.state !== AGENT_TASK_STATE.INCOMPLETE) {
      return;
    }

    const owningAgentId =
      task.ownerSource?.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT ? task.ownerSource.agentId : undefined;
    try {
      const owningAgentName = this.getAgentName(owningAgentId);
      const dispatchAgentId =
        task.dispatchSource?.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT ? task.dispatchSource.agentId : undefined;
      const dispatchAgentName = this.getAgentName(dispatchAgentId);
      if (!dispatchAgentId) {
        log.debug(
          { agentId: owningAgentId, agentName: owningAgentName, taskId: task.id, taskState: task.state },
          "Task completed, no agent notification needed."
        );
        return;
      }

      let notificationPrompt: string;

      if (task.state === AGENT_TASK_STATE.INCOMPLETE) {
        notificationPrompt = createMessageContentFromTemplate(
          TASK_INCOMPLETE_PROMPT,
          getDefaultPromptContext({ agentId: owningAgentId, agentName: owningAgentName })
        );
      } else {
        const recentArtifact = owningAgentId
          ? await this.artifactManager.getMostRecentArtifact(owningAgentId)
          : undefined;
        const isRecent =
          recentArtifact !== undefined &&
          Date.now() - new Date(recentArtifact.updatedAt).getTime() <= ARTIFACT_TIMESTAMP_WINDOW_MS;

        notificationPrompt = createMessageContentFromTemplate(
          isRecent && recentArtifact ? TASK_COMPLETED_PROMPT : TASK_COMPLETED_NO_ARTIFACT_PROMPT,
          getDefaultPromptContext({
            agentId: owningAgentId,
            agentName: owningAgentName,
            artifactFilename: recentArtifact?.filename,
          })
        );
      }

      this.sendMessage(dispatchAgentId, notificationPrompt, { sourceType: MESSAGE_SOURCE_TYPE.NOTIFICATION }).catch(
        (error) => {
          log.error(
            {
              agentId: owningAgentId,
              agentName: owningAgentName,
              targetAgentId: dispatchAgentId,
              targetAgentName: dispatchAgentName,
              error,
            },
            "Send message failed to notify target agent"
          );
        }
      );

      log.info(
        {
          agentId: owningAgentId,
          agentName: owningAgentName,
          targetAgentId: dispatchAgentId,
          targetAgentName: dispatchAgentName,
        },
        "Notifying task dispatch agent"
      );

      await this.taskManager.updateTaskState(task.id, AGENT_TASK_STATE.CLOSED);
    } catch (error) {
      if (error instanceof AppError && error.errorCode === APP_ERROR_CODES.AGENT_NOT_FOUND) {
        log.warn({ agentId: owningAgentId, error }, "Agent no longer exists.");
      } else {
        log.error({ agentId: owningAgentId, error }, "Failed to notify target agent.");
      }
    }
  }

  private async scheduleTask(agentId: string): Promise<void> {
    const openedTasks = this.taskManager
      .getTasksByOwner(agentId)
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .filter((task) => task.state === AGENT_TASK_STATE.OPEN);
    const nextTask = head(openedTasks);
    if (!nextTask) {
      log.info({ agentId }, `No tasks pending`);
      return;
    }

    const agentRunner = this.getAgentRunner(agentId);
    if (agentRunner.getAgentStatus() !== AGENT_STATUS.IDLE) {
      log.info({ agentId }, `Agent busy, not scheduling new task`);
      return;
    }

    this.sendMessage(agentId, nextTask.task, { sourceType: MESSAGE_SOURCE_TYPE.TASK, taskId: nextTask.id }).catch(
      (error) => {
        log.error({ agentId, taskId: nextTask.id, error }, "Task send message failed");
      }
    );

    await this.taskManager.updateTaskState(nextTask.id, AGENT_TASK_STATE.ACTIVE);
  }

  private createAgentRunner(agentId: string): AgentRunner {
    const permissionRequestCallback: PermissionRequestCallback = async (
      permAgentId,
      toolName,
      input,
      toolUseId,
      decisionReason
    ) => {
      const state = this.ensureState(permAgentId);
      const permissionInfo = { toolUseId, toolName, input, decisionReason };

      if (!state.pendingPermissions) {
        state.pendingPermissions = [];
      }

      state.pendingPermissions.push(permissionInfo);

      try {
        return await this.permissionHandler.requestPermission(permAgentId, toolName, input, toolUseId, decisionReason);
      } finally {
        if (state.pendingPermissions) {
          state.pendingPermissions = state.pendingPermissions.filter((perm) => perm.toolUseId !== toolUseId);
        }
      }
    };

    const broadcastActivityCallback = (toolName: string, description: string) => {
      this.broadcaster.broadcast({
        type: "agent_activity",
        agentId,
        toolName,
        description,
      });
    };

    const agentRunner = new AgentRunner(
      agentId,
      this.registry,
      this.mcpManager,
      permissionRequestCallback,
      broadcastActivityCallback
    );
    agentRunner.on("agentStatusChanged", ({ agentId: runnerId, status }) =>
      this.onAgentStatusChanged(runnerId, status)
    );

    return agentRunner;
  }

  private getAgentRunner(agentId: string): AgentRunner {
    const agentRunner = this.agentRunners.get(agentId);
    if (!agentRunner) {
      throw new AppError(`Agent ${agentId} does not have runner`, APP_ERROR_CODES.AGENT_NOT_FOUND);
    }

    return agentRunner;
  }

  private getAgentName(agentId?: string): string {
    if (!agentId) {
      return "";
    }

    return this.registry.getAgent(agentId).name;
  }
}
