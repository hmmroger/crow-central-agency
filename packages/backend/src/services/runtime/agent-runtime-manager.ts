import type { SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  AGENT_MESSAGE_ROLE,
  AGENT_STATUS,
  AGENT_TASK_STATE,
  AgentActivitySchema,
  AgentRuntimeStateSchema,
  SERVER_MESSAGE_TYPE,
  AGENT_MESSAGE_TYPE,
  type AgentConfig,
  type AgentRuntimeState,
  type AgentStatus,
  type AgentTaskItem,
  type AgentActivity,
  AGENT_ACTIVITY_TYPE,
  type PermissionDecision,
  type AgentMessage,
} from "@crow-central-agency/shared";
import type { AgentRegistry } from "../agent-registry.js";
import type { WsBroadcaster } from "../ws-broadcaster.js";
import { PermissionHandler } from "./permission-handler.js";
import type { SessionManager } from "../session/session-manager.js";
import type { MessageQueueManager } from "../message-queue-manager.js";
import { MESSAGE_SOURCE_TYPE, type MessageSource } from "../message-queue-manager.types.js";
import crypto from "node:crypto";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import { logger } from "../../utils/logger.js";
import type { ObjectStoreProvider } from "../../core/store/object-store.types.js";
import { AgentRunner } from "../../runner/agent-runner.js";
import {
  AGENT_STREAM_EVENT_TYPE,
  type AgentStreamActivityEvent,
  type AgentStreamToolUseEvent,
  type PermissionRequestCallback,
} from "../../runner/agent-runner.types.js";
import type { CrowMcpManager } from "../../mcp/crow-mcp-manager.js";
import type { AgentTaskManager } from "../agent-task-manager.js";
import { head, isString } from "es-toolkit";
import { EventBus } from "../../core/event-bus/event-bus.js";
import type { AgentRuntimeManagerEvents, ArtifactRecord } from "./agent-runtime-manager.types.js";
import { startQuerySpan, type AgentQuerySpan } from "../../telemetry/agent-telemetry.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { ARTIFACTS_MCP_SERVER_NAME } from "../../mcp/artifacts/artifacts-mcp-server.js";
import { WRITE_ARTIFACT_TOOL_NAME } from "../../mcp/artifacts/write-artifact.js";
import { WRITE_CIRCLE_ARTIFACT_TOOL_NAME } from "../../mcp/artifacts/write-circle-artifact.js";
import type { AgentCircleManager } from "../agent-circle-manager.js";
import { generateId } from "../../utils/id-utils.js";
import { AGENTS_DIR_NAME } from "../../config/constants.js";
import { env } from "../../config/env.js";
import { audioGeneration } from "../content-generation/audio-generation-service.js";

const MAX_ACTIVITIES_RECORDS = 300;

const log = logger.child({ context: "agent-runtime-manager" });

/** Object store table name for agent runtime manager states */
export const AGENT_RUNTIME_MANAGER_STORE_TABLE = "orchestrator-state";

/**
 * Agent runtime manager - central state machine that owns agent runtimes.
 */
export class AgentRuntimeManager extends EventBus<AgentRuntimeManagerEvents> {
  private agentRunners = new Map<string, AgentRunner>();
  private agentActivities = new Map<string, AgentActivity[]>();
  private runtimeStates = new Map<string, AgentRuntimeState>();
  private activeQuerySpans = new Map<string, AgentQuerySpan>();
  private readonly permissionHandler: PermissionHandler;

  constructor(
    private readonly store: ObjectStoreProvider,
    private readonly broadcaster: WsBroadcaster,
    private readonly registry: AgentRegistry,
    private readonly mcpManager: CrowMcpManager,
    private readonly sessionManager: SessionManager,
    private readonly messageQueue: MessageQueueManager,
    private readonly taskManager: AgentTaskManager,
    private readonly sensorManager: SensorManager,
    private readonly circleManager: AgentCircleManager
  ) {
    super();
    this.permissionHandler = new PermissionHandler(broadcaster);
    this.registry.on("agentCreated", async ({ agent }) => this.onAgentCreated(agent));
    this.registry.on("agentDeleted", async ({ agentId }) => this.onAgentDeleted(agentId));
  }

  /**
   * Load runtime states from the object store on startup and run recovery.
   */
  public async initialize(): Promise<void> {
    const storeEntries = await this.store.getAll<AgentRuntimeState>(AGENT_RUNTIME_MANAGER_STORE_TABLE);

    for (const entry of storeEntries) {
      const result = AgentRuntimeStateSchema.safeParse(entry.value);
      if (result.success) {
        this.runtimeStates.set(result.data.agentId, result.data);
      } else {
        log.warn({ issues: result.error.issues }, "Skipping invalid runtime state in object store");
      }
    }

    log.info({ count: this.runtimeStates.size }, "Loaded runtime states from object store");

    const agents = this.registry.getAllAgents(true);
    for (const agent of agents) {
      await this.loadAgentActivities(agent.id);
      this.ensureState(agent.id);
      const runner = this.createAgentRunner(agent.id);
      this.agentRunners.set(agent.id, runner);
    }

    await this.runStartupRecovery();
  }

  /** Get runtime state for an agent */
  public getState(agentId: string): AgentRuntimeState | undefined {
    return this.runtimeStates.get(agentId);
  }

  public getActivities(agentId: string): AgentActivity[] | undefined {
    return this.agentActivities.get(agentId);
  }

  /** Get all runtime states */
  public getAllStates(): AgentRuntimeState[] {
    return Array.from(this.runtimeStates.values());
  }

  /**
   * Send a message to an agent - creates an SDK query and processes the stream.
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
    this.permissionHandler.cancelAllForAgent(agentId);
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
      await this.persistAgentState(agentId);
    } catch (error) {
      log.error({ agentId, error }, "Failed to persist state after newSession");
    }
  }

  /** Resolve a pending permission request with the user's decision. */
  public resolvePermission(toolUseId: string, decision: PermissionDecision, message?: string): void {
    this.permissionHandler.resolvePermission(toolUseId, decision, message);
  }

  /**
   * Generate audio for an existing agent message and attach it via the session manager.
   * Reads the message content from the agent's current session, synthesizes audio with
   * the configured audio generation provider, then persists the audio binary and
   * annotation. Returns the updated AgentMessage.
   */
  public async generateAudioForMessage(agentId: string, messageId: string): Promise<AgentMessage> {
    const model = env.AUDIO_GENERATION_MODEL;
    if (!model) {
      throw new AppError("Audio generation model is not configured", APP_ERROR_CODES.NOT_SUPPORTED);
    }

    const state = this.getState(agentId);
    if (!state?.sessionId) {
      throw new AppError(`Agent ${agentId} has no active session`, APP_ERROR_CODES.SESSION_NOT_FOUND);
    }

    const message = this.sessionManager.getMessage(state.sessionId, messageId);
    if (!message.content.trim()) {
      throw new AppError(`Message ${messageId} has no content to synthesize`, APP_ERROR_CODES.VALIDATION);
    }

    const voiceConfig = this.registry.getAgent(agentId).agentVoiceConfig;
    const response = await audioGeneration(model, message.content, {
      voice: [{ voice: voiceConfig?.voiceName }],
      stylePrompt: voiceConfig?.stylePrompt,
    });
    return this.sessionManager.associateAudioMessage(state.sessionId, messageId, response.message);
  }

  private async runAgent(
    agentId: string,
    message: string,
    state: AgentRuntimeState,
    source: MessageSource
  ): Promise<void> {
    const agentRunner = this.getAgentRunner(agentId);
    const agentName = this.registry.getAgentName(agentId);
    const querySpan = startQuerySpan(agentId, agentName, source.sourceType);
    this.activeQuerySpans.set(agentId, querySpan);

    // Process stream via async generator
    let userMessageAdded = false;
    let lastAssistantMessage: string | undefined;
    const artifactsWritten: ArtifactRecord[] = [];
    let isAbortedOrError = false;
    try {
      const eventStream = agentRunner.sendMessage(message, source, state.sessionId);
      for await (const event of eventStream) {
        switch (event.type) {
          case AGENT_STREAM_EVENT_TYPE.INIT:
            this.addQueryStartActivity(agentId);
            querySpan.setSessionId(event.sessionId);
            state.lastError = undefined;
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
              await this.registry.setAvailableTools(agentId, event.discoveredTools);
            }

            await this.persistAgentState(agentId);
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
              if (msg.role === AGENT_MESSAGE_ROLE.AGENT && msg.type === AGENT_MESSAGE_TYPE.TEXT) {
                lastAssistantMessage = msg.content;
              } else if (msg.role === AGENT_MESSAGE_ROLE.SYSTEM && msg.type === AGENT_MESSAGE_TYPE.TOOL_USE) {
                switch (msg.toolName) {
                  case this.mcpManager.getCompleteMcpToolName(ARTIFACTS_MCP_SERVER_NAME, WRITE_ARTIFACT_TOOL_NAME): {
                    const filename = msg.toolInput["filename"];
                    if (isString(filename)) {
                      artifactsWritten.push({ filename });
                    }

                    break;
                  }

                  case this.mcpManager.getCompleteMcpToolName(
                    ARTIFACTS_MCP_SERVER_NAME,
                    WRITE_CIRCLE_ARTIFACT_TOOL_NAME
                  ): {
                    const filename = msg.toolInput["filename"];
                    const circleId = msg.toolInput["circle_id"];
                    if (isString(filename) && isString(circleId)) {
                      artifactsWritten.push({ circleId, filename });
                    }

                    break;
                  }

                  default:
                }
              }
            }

            const { totalInputTokens, inputTokens, outputTokens } = event;
            querySpan.recordTokenUsage(inputTokens, outputTokens, totalInputTokens);
            state.sessionUsage.inputTokens = totalInputTokens;
            state.sessionUsage.outputTokens += outputTokens;

            this.broadcaster.broadcast({
              type: SERVER_MESSAGE_TYPE.AGENT_USAGE,
              agentId,
              inputTokens: state.sessionUsage.inputTokens,
              outputTokens: state.sessionUsage.outputTokens,
              totalCostUsd: state.sessionUsage.totalCostUsd,
              contextTotal: state.sessionUsage.contextTotal,
              contextUsed: 0,
            });
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

          case AGENT_STREAM_EVENT_TYPE.ACTIVITY:
          case AGENT_STREAM_EVENT_TYPE.TOOL_USE:
            this.handleAgentActivityEvent(event);
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
            querySpan.endSuccess(event.durationMs, event.doneType);
            state.sessionUsage.totalCostUsd += event.usage?.totalCostUsd ?? 0;
            state.sessionUsage.contextUsed = 0;
            state.sessionUsage.contextTotal = event.usage?.contextTotal ?? 0;
            const totalCostUsd = state.sessionUsage.totalCostUsd;
            this.broadcaster.broadcast({
              type: SERVER_MESSAGE_TYPE.AGENT_RESULT,
              agentId,
              subtype: event.doneType,
              totalCostUsd,
              durationMs: event.durationMs,
            });
            break;
          }

          case AGENT_STREAM_EVENT_TYPE.ABORTED:
            querySpan.endAborted();
            isAbortedOrError = true;
            break;

          case AGENT_STREAM_EVENT_TYPE.ERROR:
            querySpan.endError(event.error);
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
    } catch (error) {
      querySpan.endError(error instanceof Error ? error : String(error));
      isAbortedOrError = true;
      state.lastError = error instanceof Error ? error.message : "Unknown error";
      log.error({ agentId, error }, "Run agent execution failed");
    } finally {
      this.activeQuerySpans.delete(agentId);
      await this.persistAgentState(agentId);
      await this.persistAgentActivities(agentId);
      this.emit("messageDone", {
        agentId,
        source,
        lastAssistantMessage,
        artifactsWritten,
        isAbortedOrError,
        error: state.lastError,
      });
    }
  }

  private handleAgentActivityEvent(streamEvent: AgentStreamActivityEvent | AgentStreamToolUseEvent): void {
    const timestamp = Date.now();
    let newActivity: AgentActivity;
    switch (streamEvent.type) {
      case AGENT_STREAM_EVENT_TYPE.ACTIVITY:
        newActivity = {
          id: generateId(),
          type: AGENT_ACTIVITY_TYPE.GENERAL,
          timestamp,
          activity: streamEvent.activity,
          description: streamEvent.description,
          subAgentId: streamEvent.subAgentId,
        };
        break;

      case AGENT_STREAM_EVENT_TYPE.TOOL_USE:
        newActivity = {
          id: generateId(),
          type: AGENT_ACTIVITY_TYPE.TOOLUSE,
          timestamp,
          toolName: streamEvent.toolName,
          description: streamEvent.description,
          input: streamEvent.input,
          subAgentId: streamEvent.subAgentId,
        };
        this.activeQuerySpans.get(streamEvent.agentId)?.addToolUseEvent(streamEvent.toolName, streamEvent.description);
        break;
    }

    this.appendActivity(streamEvent.agentId, newActivity);
  }

  private addQueryStartActivity(agentId: string): void {
    this.appendActivity(agentId, {
      id: generateId(),
      type: AGENT_ACTIVITY_TYPE.QUERYSTART,
      timestamp: Date.now(),
    });
  }

  private appendActivity(agentId: string, activity: AgentActivity): void {
    let activities = this.agentActivities.get(agentId);
    if (!activities) {
      activities = [];
      this.agentActivities.set(agentId, activities);
    }

    activities.push(activity);
    this.broadcaster.broadcast({
      type: SERVER_MESSAGE_TYPE.AGENT_ACTIVITY,
      agentId,
      agentActivity: activity,
    });
  }

  /** Cleanup when an agent is deleted - triggered by registry agentDeleted event */
  private async cleanup(agentId: string): Promise<void> {
    this.permissionHandler.cancelAllForAgent(agentId);

    const agentRunner = this.getAgentRunner(agentId);
    await agentRunner.abort();
    this.agentRunners.delete(agentId);

    this.runtimeStates.delete(agentId);
    await this.messageQueue.clear(agentId);

    try {
      await this.store.delete(AGENT_RUNTIME_MANAGER_STORE_TABLE, agentId);
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

    const activities = this.agentActivities.get(agentId);
    if (!activities) {
      this.agentActivities.set(agentId, []);
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

  /** Persist a single agent's runtime state to the store */
  private async persistAgentState(agentId: string): Promise<void> {
    const state = this.runtimeStates.get(agentId);
    if (state) {
      await this.store.set(AGENT_RUNTIME_MANAGER_STORE_TABLE, agentId, state);
    }
  }

  /** Persist all runtime states to the store (used after bulk recovery mutations) */
  private async persistAllStates(): Promise<void> {
    const entries: Array<readonly [string, AgentRuntimeState]> = Array.from(this.runtimeStates.entries());
    if (entries.length > 0) {
      await this.store.setMany(AGENT_RUNTIME_MANAGER_STORE_TABLE, entries);
    }
  }

  /** Hydrate persisted activities for an agent from the object store */
  private async loadAgentActivities(agentId: string): Promise<void> {
    const tableName = this.getAgentActivitiesTable(agentId);
    const storeEntries = await this.store.getAll<AgentActivity>(tableName);
    const loaded: AgentActivity[] = [];
    for (const entry of storeEntries) {
      const result = AgentActivitySchema.safeParse(entry.value);
      if (result.success) {
        loaded.push(result.data);
      } else {
        log.warn({ agentId, issues: result.error.issues }, "Skipping invalid activity in object store");
      }
    }

    loaded.sort((a, b) => a.timestamp - b.timestamp);
    this.agentActivities.set(agentId, loaded);
  }

  private async persistAgentActivities(agentId: string): Promise<void> {
    let activities = this.getActivities(agentId);
    if (!activities) {
      return;
    }

    const tableName = this.getAgentActivitiesTable(agentId);

    const drop = activities.length - MAX_ACTIVITIES_RECORDS;
    if (drop > 0) {
      const droppedActivities = activities.slice(0, drop);
      const truncatedActivities = activities.slice(drop);
      this.agentActivities.set(agentId, truncatedActivities);
      activities = truncatedActivities;

      for (const dropped of droppedActivities) {
        try {
          await this.store.delete(tableName, dropped.id);
        } catch (error) {
          log.warn({ agentId, activityId: dropped.id, error }, "Failed to evict activity from store");
        }
      }
    }

    await this.store.setMany(
      tableName,
      activities.map((activity) => [activity.id, activity])
    );
  }

  /** Startup recovery - resume agents based on their persisted status */
  private async runStartupRecovery(): Promise<void> {
    const agentsToResume: string[] = [];
    const agentsToResetTasks: string[] = [];

    for (const [agentId, state] of this.runtimeStates) {
      try {
        this.registry.getAgent(agentId);
      } catch {
        log.warn({ agentId }, "Orphaned runtime state - agent no longer exists, cleaning up");
        this.runtimeStates.delete(agentId);
        await this.store.delete(AGENT_RUNTIME_MANAGER_STORE_TABLE, agentId);

        continue;
      }

      // Clear stale pending permissions - SDK callbacks no longer exist after restart
      if (state.pendingPermissions?.length) {
        log.info({ agentId, count: state.pendingPermissions.length }, "Clearing stale pending permissions");
        state.pendingPermissions = undefined;
      }

      state.discordDmChannelId = undefined;

      switch (state.status) {
        case AGENT_STATUS.ACTIVATING:
        case AGENT_STATUS.STREAMING:
          // Agent was working - resume by sending "continue your work"
          agentsToResume.push(agentId);
          log.info({ agentId, status: state.status }, "Will resume agent after startup");
          break;

        case AGENT_STATUS.COMPACTING:
          // Compaction was interrupted - set to idle
          state.status = AGENT_STATUS.IDLE;
          agentsToResetTasks.push(agentId);
          log.info({ agentId }, "Reset compacting agent to idle");
          break;

        case AGENT_STATUS.IDLE:
          agentsToResetTasks.push(agentId);
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

      // Separate active tasks into parent tasks waiting on sub-tasks vs working tasks
      const activeTasks = this.taskManager
        .getTasksByOwner(agentId)
        .filter((task) => task.state === AGENT_TASK_STATE.ACTIVE);
      const { waitingParentTasks, workingTasks } = this.partitionActiveTasks(activeTasks);

      // Keep waiting parent tasks ACTIVE — they're waiting on sub-task results
      for (const task of waitingParentTasks) {
        log.info({ agentId, taskId: task.id }, "Keeping parent task active (waiting on sub-tasks)");
      }

      // Resume the first working task, reset others to OPEN
      const firstWorkingTask = head(workingTasks);
      if (firstWorkingTask) {
        messageSource = { sourceType: MESSAGE_SOURCE_TYPE.TASK, taskId: firstWorkingTask.id };
        for (const task of workingTasks.slice(1)) {
          await this.taskManager.updateTaskState(task.id, AGENT_TASK_STATE.OPEN);
        }
      }

      log.info({ agentId, sourceType: messageSource.sourceType }, "Resume agent.");

      // Fire-and-forget - don't block startup
      this.sendMessage(agentId, "Continue your work from where you left off.", messageSource).catch((error) => {
        log.error({ agentId, error }, "Failed to resume agent on startup");
      });
    }

    // Reset stale active tasks for agents that were not streaming
    for (const agentId of agentsToResetTasks) {
      const activeTasks = this.taskManager
        .getTasksByOwner(agentId)
        .filter((task) => task.state === AGENT_TASK_STATE.ACTIVE);
      const { waitingParentTasks, workingTasks } = this.partitionActiveTasks(activeTasks);

      // Keep waiting parent tasks ACTIVE
      for (const task of waitingParentTasks) {
        log.info({ agentId, taskId: task.id }, "Keeping parent task active (waiting on sub-tasks)");
      }

      // Reset stale working tasks to OPEN (agent was idle, these shouldn't be ACTIVE)
      for (const task of workingTasks) {
        await this.taskManager.updateTaskState(task.id, AGENT_TASK_STATE.OPEN);
        log.info({ agentId, taskId: task.id }, "Reset stale active task to open");
      }
    }

    await this.persistAllStates();
    this.emit("runtimeManagerStartup", undefined);

    // Drain persisted queues for agents that are idle after recovery
    for (const [agentId, state] of this.runtimeStates) {
      if (state.status === AGENT_STATUS.IDLE) {
        this.drainQueue(agentId).catch((error) => {
          log.error({ agentId, error }, "Queue drain failed during startup recovery");
        });
      }
    }
  }

  private async onAgentCreated(agentConfig: AgentConfig): Promise<void> {
    this.ensureState(agentConfig.id);
    const runner = this.createAgentRunner(agentConfig.id);
    this.agentRunners.set(agentConfig.id, runner);
  }

  private async onAgentDeleted(agentId: string): Promise<void> {
    await this.cleanup(agentId);
  }

  private async onAgentStatusChanged(
    agentId: string,
    status: AgentStatus,
    messageSource: MessageSource
  ): Promise<void> {
    const agentState = this.getState(agentId);
    if (!agentState) {
      return;
    }

    if (status === AGENT_STATUS.ACTIVATING) {
      if (messageSource.sourceType === MESSAGE_SOURCE_TYPE.DISCORD) {
        // Set DM channel for DMs, clear stale DM channel for guild messages
        agentState.discordDmChannelId = messageSource.isDm ? messageSource.channelId : undefined;
      } else if (messageSource.sourceType === MESSAGE_SOURCE_TYPE.USER) {
        agentState.discordDmChannelId = undefined;
      }
    }

    const isNewStatusIdle = status === AGENT_STATUS.IDLE;
    agentState.status = status;
    agentState.messageSource = isNewStatusIdle ? undefined : messageSource;
    this.broadcaster.broadcast({
      type: SERVER_MESSAGE_TYPE.AGENT_STATUS,
      agentId,
      status,
      messageSource,
    });
    this.emit("agentStatusChanged", { agentId, status, messageSource });
    await this.persistAgentState(agentId);

    if (!isNewStatusIdle) {
      return;
    }

    this.drainQueue(agentId).catch((error) => {
      log.error({ agentId, error }, "Queue drain failed");
    });
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

    const agentRunner = new AgentRunner(
      agentId,
      this.registry,
      this.mcpManager,
      this.sensorManager,
      this.circleManager,
      permissionRequestCallback,
      (streamEvent) => this.handleAgentActivityEvent(streamEvent)
    );
    agentRunner.on("agentStatusChanged", ({ agentId: runnerId, status, messageSource }) =>
      this.onAgentStatusChanged(runnerId, status, messageSource)
    );

    return agentRunner;
  }

  /**
   * Partition active tasks into parent tasks waiting on unresolved sub-tasks
   * vs working tasks that were being actively executed.
   */
  private partitionActiveTasks(activeTasks: AgentTaskItem[]): {
    waitingParentTasks: AgentTaskItem[];
    workingTasks: AgentTaskItem[];
  } {
    const waitingParentTasks: AgentTaskItem[] = [];
    const workingTasks: AgentTaskItem[] = [];

    for (const task of activeTasks) {
      if (task.subTaskIds?.length && !this.taskManager.areSubTasksResolved(task.id, AGENT_TASK_STATE.INCOMPLETE)) {
        waitingParentTasks.push(task);
      } else {
        workingTasks.push(task);
      }
    }

    return { waitingParentTasks, workingTasks };
  }

  private getAgentRunner(agentId: string): AgentRunner {
    const agentRunner = this.agentRunners.get(agentId);
    if (!agentRunner) {
      throw new AppError(`Agent ${agentId} does not have runner`, APP_ERROR_CODES.AGENT_NOT_FOUND);
    }

    return agentRunner;
  }

  private getAgentActivitiesTable(agentId: string): string {
    return `${AGENTS_DIR_NAME}/${agentId}/activities`;
  }
}
