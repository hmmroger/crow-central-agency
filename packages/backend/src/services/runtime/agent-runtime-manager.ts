import {
  AGENT_MESSAGE_ROLE,
  AGENT_STATUS,
  AGENT_TASK_STATE,
  AgentActivitySchema,
  AgentRuntimeStateSchema,
  MAX_INPUT_HISTORY,
  SERVER_MESSAGE_TYPE,
  AGENT_MESSAGE_TYPE,
  type AgentConfig,
  type AgentRuntimeState,
  type AgentStatus,
  type AgentTaskItem,
  type AgentActivity,
  AGENT_ACTIVITY_TYPE,
  type BranchPoint,
  type PermissionDecision,
  type QuestionSubmission,
  type SessionHistoryNode,
  type AgentMessage,
  AGENT_TASK_SOURCE_TYPE,
} from "@crow-central-agency/shared";
import type { AgentRegistry } from "../agent-registry.js";
import type { WsBroadcaster } from "../ws-broadcaster.js";
import { PermissionHandler } from "./permission-handler.js";
import { QuestionHandler } from "./question-handler.js";
import { assertBranchSource, assertSwitchTarget, buildSessionTree, updateSessionHistory } from "./session-history.js";
import type { SessionHistoryUpdate } from "./session-history.types.js";
import type { SessionManager } from "../session/session-manager.js";
import type { MessageQueueManager } from "../message-queue-manager.js";
import { MESSAGE_SOURCE_TYPE, type MessageSource, type QueuedMessage } from "../message-queue-manager.types.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import { logger } from "../../utils/logger.js";
import type { ObjectStoreProvider } from "../../core/store/object-store.types.js";
import type { AgentRunner } from "../../runner/agent-runner.js";
import type { FragmentManager } from "../fragment/fragment-manager.js";
import { createAgentRunner as buildAgentRunner } from "../../runner/agent-runner-factory.js";
import {
  AGENT_STREAM_EVENT_TYPE,
  type AgentStreamActivityEvent,
  type AgentStreamToolAutoApprovedEvent,
  type AgentStreamToolUseEvent,
  type PermissionRequestCallback,
  type QuestionRequestCallback,
} from "../../runner/agent-runner.types.js";
import type { CrowMcpManager } from "../../mcp/crow-mcp-manager.js";
import type { AgentTaskManager } from "../agent-task-manager.js";
import { head, isString, uniqBy } from "es-toolkit";
import { EventBus } from "../../core/event-bus/event-bus.js";
import type { AgentRuntimeManagerEvents, ArtifactRecord } from "./agent-runtime-manager.types.js";
import { startQuerySpan, type AgentQuerySpan } from "../../telemetry/agent-telemetry.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { ARTIFACTS_MCP_SERVER_NAME } from "../../mcp/artifacts/artifacts-mcp-server.js";
import { WRITE_ARTIFACT_TOOL_NAME } from "../../mcp/artifacts/write-artifact.js";
import { EDIT_ARTIFACT_TOOL_NAME } from "../../mcp/artifacts/edit-artifact.js";
import { WRITE_CIRCLE_ARTIFACT_TOOL_NAME } from "../../mcp/artifacts/write-circle-artifact.js";
import { EDIT_CIRCLE_ARTIFACT_TOOL_NAME } from "../../mcp/artifacts/edit-circle-artifact.js";
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
  private sessionTrees = new Map<string, SessionHistoryNode[]>();
  private activeQuerySpans = new Map<string, AgentQuerySpan>();
  private readonly permissionHandler: PermissionHandler;
  private readonly questionHandler: QuestionHandler;

  constructor(
    private readonly store: ObjectStoreProvider,
    private readonly broadcaster: WsBroadcaster,
    private readonly registry: AgentRegistry,
    private readonly mcpManager: CrowMcpManager,
    private readonly sessionManager: SessionManager,
    private readonly messageQueue: MessageQueueManager,
    private readonly taskManager: AgentTaskManager,
    private readonly sensorManager: SensorManager,
    private readonly circleManager: AgentCircleManager,
    private readonly fragmentManager: FragmentManager
  ) {
    super();
    this.permissionHandler = new PermissionHandler(broadcaster);
    this.questionHandler = new QuestionHandler(broadcaster);
    this.registry.on("agentCreated", async ({ agent }) => this.onAgentCreated(agent));
    this.registry.on("agentDeleted", async ({ agentId }) => this.onAgentDeleted(agentId));
    this.registry.on("agentUpdated", async ({ agent, previousAgent, agentMdChanged }) =>
      this.onAgentUpdated(agent, previousAgent, agentMdChanged)
    );
  }

  /**
   * Load runtime states from the object store and create per-agent runners.
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
  }

  public async startRecovery(): Promise<void> {
    await this.runStartupRecovery();
  }

  /** Get runtime state for an agent */
  public getState(agentId: string): AgentRuntimeState | undefined {
    return this.runtimeStates.get(agentId);
  }

  public getActivities(agentId: string): AgentActivity[] | undefined {
    return this.agentActivities.get(agentId);
  }

  public getSessionTree(agentId: string): SessionHistoryNode[] {
    const sessionTree = this.sessionTrees.get(agentId);
    if (sessionTree) {
      return sessionTree;
    }

    const builtTree = buildSessionTree(this.runtimeStates.get(agentId)?.sessionHistory);
    this.sessionTrees.set(agentId, builtTree);

    return builtTree;
  }

  /** Get all runtime states */
  public getAllStates(): AgentRuntimeState[] {
    return Array.from(this.runtimeStates.values());
  }

  public async getQueuedMessages(agentId: string): Promise<QueuedMessage[]> {
    return await this.messageQueue.getMessages(agentId);
  }

  /**
   * Send a message to an agent - creates an SDK query and processes the stream.
   * If the agent is busy, the message is transparently enqueued and processed
   * when the agent becomes idle.
   *
   * A `branchPoint` forks the named session at its anchor and continues from the fork. It is
   * rejected rather than enqueued when the agent is busy: the queue carries only (message, source),
   * so a deferred branch would rewind against a session the user is no longer looking at.
   */
  public async sendMessage(
    agentId: string,
    message: string,
    source: MessageSource = { sourceType: MESSAGE_SOURCE_TYPE.USER },
    branchPoint?: BranchPoint
  ): Promise<void> {
    const state = this.ensureState(agentId);
    const agentRunner = this.getAgentRunner(agentId);
    if (agentRunner.getAgentStatus() !== AGENT_STATUS.IDLE) {
      if (branchPoint) {
        throw new AppError("Agent must be idle to branch a session", APP_ERROR_CODES.CONFLICT);
      }

      await this.messageQueue.enqueue(agentId, message, source);
      return;
    }

    await this.runAgent(agentId, message, state, source, branchPoint);
  }

  /**
   * Run a single turn directly (not queued) and resolve with the agent's final assistant message.
   * Used for internal request/response generation on a dedicated agent; the caller awaits the result.
   * Throws if the agent is already busy.
   */
  public async runAgentForResult(agentId: string, message: string, source: MessageSource): Promise<string | undefined> {
    const state = this.ensureState(agentId);
    const agentRunner = this.getAgentRunner(agentId);
    if (agentRunner.getAgentStatus() !== AGENT_STATUS.IDLE) {
      throw new AppError(
        "The agent is busy with another request. Please try again in a moment.",
        APP_ERROR_CODES.CONFLICT
      );
    }

    return this.runAgent(agentId, message, state, source);
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

    // Abort BEFORE settling any parked question: cancelQuestionsForAgent resolves the canUseTool
    // promise synchronously, so it must run only once the query is aborted and no longer consuming
    // the settle value — otherwise the still-live SDK query would receive fabricated empty answers.
    const agentRunner = this.getAgentRunner(agentId);
    await agentRunner.abort();
    this.questionHandler.cancelQuestionsForAgent(agentId);

    const state = this.getState(agentId);
    if (state?.pendingQuestion) {
      state.pendingQuestion = undefined;
      try {
        await this.persistAgentState(agentId);
      } catch (error) {
        log.error({ agentId, error }, "Failed to persist state after clearing pending question on stop");
      }
    }
  }

  /** Start a new session for an agent (clears current session, message queue, and injected messages) */
  public async newSession(agentId: string): Promise<void> {
    const state = this.ensureState(agentId);
    state.sessionId = undefined;
    state.activeDomainFragmentIds = [];
    state.pendingInstructionReminder = undefined;
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

  /** Make an existing session from the agent's ledger the current one. */
  public async switchSession(agentId: string, sessionId: string): Promise<void> {
    const state = this.ensureState(agentId);
    // Ahead of every guard so a retry of a switch that already succeeded stays a no-op.
    if (state.sessionId === sessionId) {
      return;
    }

    const agentRunner = this.getAgentRunner(agentId);
    if (agentRunner.getAgentStatus() !== AGENT_STATUS.IDLE) {
      throw new AppError("Agent must be idle to switch sessions", APP_ERROR_CODES.CONFLICT);
    }

    const agent = this.registry.getAgent(agentId);
    assertSwitchTarget(state.sessionHistory, sessionId);
    if (!(await this.sessionManager.isSessionValid(agent.type, sessionId))) {
      throw new AppError(
        `Session ${sessionId} no longer has a transcript to return to.`,
        APP_ERROR_CODES.SESSION_NOT_FOUND
      );
    }

    if (state.sessionId) {
      this.sessionManager.invalidateCache(agent.type, state.sessionId);
    }

    state.sessionId = sessionId;
    // Neither is stored per session; both refill once a query runs in the session switched to.
    state.activeDomainFragmentIds = [];
    state.sessionUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalCostUsd: 0,
      contextUsed: 0,
      contextTotal: 0,
    };

    await this.persistAgentState(agentId);
  }

  public async ensureValidSession(agentId: string): Promise<string | undefined> {
    const state = this.getState(agentId);
    if (!state?.sessionId) {
      return undefined;
    }

    const agent = this.registry.getAgent(agentId);
    if (await this.sessionManager.isSessionValid(agent.type, state.sessionId)) {
      return state.sessionId;
    }

    log.warn({ agentId, sessionId: state.sessionId }, "Persisted session no longer exists; resetting session state");
    state.sessionId = undefined;
    state.activeDomainFragmentIds = [];
    try {
      await this.persistAgentState(agentId);
    } catch (error) {
      log.error({ agentId, error }, "Failed to persist state after clearing stale session");
    }

    return undefined;
  }

  /** Replace the agent's active-domain set with the given DOMAIN fragment ids. Signal only — never used as an implicit parent. */
  public async setActiveDomains(agentId: string, domainFragmentIds: string[]): Promise<void> {
    const state = this.ensureState(agentId);
    const currentIds = new Set(state.activeDomainFragmentIds);
    const nextIds = new Set(domainFragmentIds);
    if (currentIds.size === nextIds.size && domainFragmentIds.every((domainId) => currentIds.has(domainId))) {
      return;
    }

    state.activeDomainFragmentIds = Array.from(nextIds);

    try {
      await this.persistAgentState(agentId);
    } catch (error) {
      log.error({ agentId, error }, "Failed to persist state after setActiveDomains");
    }
  }

  /** Drop the deleted fragment from the agent's active-domain set, if present. */
  public async clearActiveDomain(agentId: string, deletedFragmentId: string): Promise<void> {
    const state = this.getState(agentId);
    if (!state || !state.activeDomainFragmentIds.includes(deletedFragmentId)) {
      return;
    }

    state.activeDomainFragmentIds = state.activeDomainFragmentIds.filter((domainId) => domainId !== deletedFragmentId);

    try {
      await this.persistAgentState(agentId);
    } catch (error) {
      log.error({ agentId, error }, "Failed to persist state after clearActiveDomain");
    }
  }

  /** Set the timestamp of the last Gmail check for an agent. */
  public async setLastGmailCheckTimestamp(agentId: string, timestamp: number): Promise<void> {
    const state = this.ensureState(agentId);
    state.lastGmailCheckTimestamp = timestamp;

    try {
      await this.persistAgentState(agentId);
    } catch (error) {
      log.error({ agentId, error }, "Failed to persist state after setLastGmailCheckTimestamp");
    }
  }

  /** Resolve a pending permission request with the user's decision. */
  public resolvePermission(toolUseId: string, decision: PermissionDecision, message?: string, rules?: string[]): void {
    this.permissionHandler.resolvePermission(toolUseId, decision, message, rules);
  }

  /** Resolve a parked AskUserQuestion with the user's submission. */
  public resolveQuestion(toolUseId: string, submission: QuestionSubmission): void {
    this.questionHandler.resolveQuestion(toolUseId, submission);
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

    const agent = this.registry.getAgent(agentId);
    const message = await this.sessionManager.getMessage(agent.type, state.sessionId, messageId);
    if (!message.content.trim()) {
      throw new AppError(`Message ${messageId} has no content to synthesize`, APP_ERROR_CODES.VALIDATION);
    }

    const voiceConfig = agent.agentVoiceConfig;
    const response = await audioGeneration(model, message.content, {
      voice: [{ voice: voiceConfig?.voiceName }],
      stylePrompt: voiceConfig?.stylePrompt,
    });
    return this.sessionManager.associateAudioMessage(agent.type, state.sessionId, messageId, response.message);
  }

  /**
   * Fork the session named by `branchPoint` and repoint the agent at the fork for this turn.
   * Session history is not written here: the turn's `INIT` records the fork on the single entry
   * that path already creates.
   */
  private async branchSession(agent: AgentConfig, state: AgentRuntimeState, branchPoint: BranchPoint): Promise<void> {
    assertBranchSource(agent, state.sessionHistory, branchPoint);
    const newSessionId = await this.sessionManager.forkSession(
      agent.type,
      branchPoint.sessionId,
      branchPoint.fromMessageId
    );

    const previousSessionId = state.sessionId;
    state.sessionId = newSessionId;
    state.sessionUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalCostUsd: 0,
      contextUsed: 0,
      contextTotal: 0,
    };

    if (previousSessionId) {
      this.sessionManager.invalidateCache(agent.type, previousSessionId);
    }
  }

  private async runAgent(
    agentId: string,
    message: string,
    state: AgentRuntimeState,
    source: MessageSource,
    branchPoint?: BranchPoint
  ): Promise<string | undefined> {
    const agentRunner = this.getAgentRunner(agentId);
    const agent = this.registry.getAgent(agentId);
    const workspace = this.registry.resolveWorkspace(agent);
    // Before the span is opened, so a rejected branch reaches the caller as an error instead of
    // being swallowed by this method's own error handling and leaking the span.
    if (branchPoint) {
      await this.branchSession(agent, state, branchPoint);
    }

    const querySpan = startQuerySpan(agentId, agent.name, source.sourceType);
    this.activeQuerySpans.set(agentId, querySpan);

    // Process stream via async generator
    const persistUserMessage =
      source.sourceType !== MESSAGE_SOURCE_TYPE.COMMAND && source.sourceType !== MESSAGE_SOURCE_TYPE.INTERNAL;
    let userMessageAdded = false;
    let lastAssistantMessage: string | undefined;
    const artifactsWritten: ArtifactRecord[] = [];
    let isAbortedOrError = false;
    try {
      // Drop a persisted sessionId whose transcript is gone so the turn starts a fresh session
      // instead of silently forking off a dead one.
      await this.ensureValidSession(agentId);

      const instructionReminder = state.pendingInstructionReminder;
      const eventStream = agentRunner.sendMessage(
        message,
        source,
        state.activeDomainFragmentIds,
        state.sessionId,
        instructionReminder
      );
      for await (const event of eventStream) {
        switch (event.type) {
          case AGENT_STREAM_EVENT_TYPE.INIT: {
            this.addQueryStartActivity(agentId);
            querySpan.setSessionId(event.sessionId);
            state.lastError = undefined;
            state.sessionId = event.sessionId;
            this.updateAgentSessionHistory(state, {
              sessionId: event.sessionId,
              message,
              workspace,
              timestamp: Date.now(),
              branchPoint,
            });

            if (persistUserMessage && !userMessageAdded) {
              const userMessage = await this.sessionManager.addUserMessage(agent.type, event.sessionId, message);
              this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.AGENT_MESSAGE, agentId, message: userMessage });
              if (source.sourceType === MESSAGE_SOURCE_TYPE.USER) {
                this.recordInputHistory(state, message);
              }

              userMessageAdded = true;
              // Consume the one-shot reminder only once the turn is delivered, so an error
              // before this point leaves it pending for the retry.
              if (instructionReminder) {
                state.pendingInstructionReminder = undefined;
              }
            }

            await this.persistAgentState(agentId);
            break;
          }

          case AGENT_STREAM_EVENT_TYPE.TOOLS_DISCOVERED:
            if (event.discoveredTools.length > 0) {
              await this.registry.setAvailableTools(agentId, event.discoveredTools);
            }

            break;

          case AGENT_STREAM_EVENT_TYPE.SKILLS_DISCOVERED:
            await this.registry.setSettingSourceConfig(agentId, { discoveredSkills: event.discoveredSkills });
            break;

          case AGENT_STREAM_EVENT_TYPE.INSTRUCTION_SOURCES:
            await this.registry.setSettingSourceConfig(agentId, { instructionSources: event.instructionSources });
            break;

          case AGENT_STREAM_EVENT_TYPE.MESSAGE_DONE: {
            const agentMessages = await this.sessionManager.addMessage(agent.type, event.sessionId, event.message);
            for (const msg of agentMessages) {
              this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.AGENT_MESSAGE, agentId, message: msg });
              if (msg.role === AGENT_MESSAGE_ROLE.AGENT && msg.type === AGENT_MESSAGE_TYPE.TEXT) {
                lastAssistantMessage = msg.content;
              } else if (msg.role === AGENT_MESSAGE_ROLE.SYSTEM && msg.type === AGENT_MESSAGE_TYPE.TOOL_USE) {
                switch (msg.toolName) {
                  case this.mcpManager.getCompleteMcpToolName(ARTIFACTS_MCP_SERVER_NAME, WRITE_ARTIFACT_TOOL_NAME):
                  case this.mcpManager.getCompleteMcpToolName(ARTIFACTS_MCP_SERVER_NAME, EDIT_ARTIFACT_TOOL_NAME): {
                    const filename = msg.toolInput["filename"];
                    if (isString(filename)) {
                      artifactsWritten.push({ filename });
                    }

                    break;
                  }

                  case this.mcpManager.getCompleteMcpToolName(
                    ARTIFACTS_MCP_SERVER_NAME,
                    WRITE_CIRCLE_ARTIFACT_TOOL_NAME
                  ):
                  case this.mcpManager.getCompleteMcpToolName(
                    ARTIFACTS_MCP_SERVER_NAME,
                    EDIT_CIRCLE_ARTIFACT_TOOL_NAME
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

            break;
          }

          case AGENT_STREAM_EVENT_TYPE.USAGE: {
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

          case AGENT_STREAM_EVENT_TYPE.TOOL_AUTO_APPROVED:
            this.handleToolAutoApproved(event);
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
        artifactsWritten: uniqBy(artifactsWritten, (record) => `${record.circleId ?? ""}/${record.filename}`),
        isAbortedOrError,
        error: state.lastError,
      });
    }

    return lastAssistantMessage;
  }

  private handleOobStreamEvent(
    streamEvent: AgentStreamActivityEvent | AgentStreamToolUseEvent | AgentStreamToolAutoApprovedEvent
  ): void {
    if (streamEvent.type === AGENT_STREAM_EVENT_TYPE.TOOL_AUTO_APPROVED) {
      this.handleToolAutoApproved(streamEvent);
      return;
    }

    this.handleAgentActivityEvent(streamEvent);
  }

  private handleToolAutoApproved(streamEvent: AgentStreamToolAutoApprovedEvent): void {
    this.registry.addAutoApprovedTools(streamEvent.agentId, streamEvent.rules).catch((error) => {
      log.warn(
        { agentId: streamEvent.agentId, rules: streamEvent.rules, error },
        "Failed to persist auto-approved tools"
      );
    });
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

    // Abort before settling parked questions so the synchronous resolve never reaches a live query.
    const agentRunner = this.getAgentRunner(agentId);
    await agentRunner.abort();
    this.questionHandler.cancelQuestionsForAgent(agentId);
    await agentRunner.dispose();
    this.agentRunners.delete(agentId);

    this.runtimeStates.delete(agentId);
    this.sessionTrees.delete(agentId);
    await this.messageQueue.clear(agentId);

    try {
      await this.store.delete(AGENT_RUNTIME_MANAGER_STORE_TABLE, agentId);
    } catch (error) {
      log.error({ agentId, error }, "Failed to persist state after cleanup");
    }
  }

  private updateAgentSessionHistory(state: AgentRuntimeState, update: SessionHistoryUpdate): void {
    const updated = updateSessionHistory(state.sessionHistory, this.getSessionTree(state.agentId), update);
    state.sessionHistory = updated.history;
    if (updated.sessionTree === undefined) {
      return;
    }

    this.sessionTrees.set(state.agentId, updated.sessionTree);
    this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.AGENT_SESSIONS_UPDATED, agentId: state.agentId });
  }

  /** Ensure a runtime state exists for the given agent */
  private ensureState(agentId: string): AgentRuntimeState {
    let state = this.runtimeStates.get(agentId);
    if (!state) {
      state = {
        agentId,
        status: AGENT_STATUS.IDLE,
        activeDomainFragmentIds: [],
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

  /**
   * Skips consecutive duplicates; caps to MAX_INPUT_HISTORY (oldest first).
   * Mutates state in place; caller persists via persistAgentState.
   */
  private recordInputHistory(state: AgentRuntimeState, message: string): void {
    const history = state.inputHistory ?? [];
    if (history.at(-1) === message) {
      return;
    }

    state.inputHistory = [...history, message].slice(-MAX_INPUT_HISTORY);
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
      let agent: AgentConfig;
      try {
        agent = this.registry.getAgent(agentId);
      } catch {
        log.warn({ agentId }, "Orphaned runtime state - agent no longer exists, cleaning up");
        this.runtimeStates.delete(agentId);
        this.sessionTrees.delete(agentId);
        await this.store.delete(AGENT_RUNTIME_MANAGER_STORE_TABLE, agentId);

        continue;
      }

      // Clear stale pending permissions - SDK callbacks no longer exist after restart
      if (state.pendingPermissions?.length) {
        log.info({ agentId, count: state.pendingPermissions.length }, "Clearing stale pending permissions");
        state.pendingPermissions = undefined;
      }

      // Clear a stale pending question - the parked query and its promise died with the process
      if (state.pendingQuestion) {
        log.info({ agentId }, "Clearing stale pending question");
        state.pendingQuestion = undefined;
      }

      state.discordDmChannelId = undefined;

      // Background agents run request-scoped work with no persisted session — there is nothing to resume.
      if (agent.isBackgroundAgent) {
        state.status = AGENT_STATUS.IDLE;
        continue;
      }

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

  private async onAgentUpdated(
    agentConfig: AgentConfig,
    previousAgent: AgentConfig,
    agentMdChanged: boolean
  ): Promise<void> {
    const personaChanged = agentConfig.persona !== previousAgent.persona;
    if (!personaChanged && !agentMdChanged) {
      return;
    }

    const state = this.ensureState(agentConfig.id);
    state.pendingInstructionReminder = {
      persona: personaChanged || state.pendingInstructionReminder?.persona ? true : undefined,
      agentMd: agentMdChanged || state.pendingInstructionReminder?.agentMd ? true : undefined,
    };

    try {
      await this.persistAgentState(agentConfig.id);
    } catch (error) {
      log.error({ agentId: agentConfig.id, error }, "Failed to persist pending instruction reminder");
    }
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
      switch (messageSource.sourceType) {
        case MESSAGE_SOURCE_TYPE.DISCORD:
          // Set DM channel for DMs, clear stale DM channel for guild messages
          agentState.discordDmChannelId = messageSource.isDm ? messageSource.channelId : undefined;
          break;

        case MESSAGE_SOURCE_TYPE.USER:
          agentState.discordDmChannelId = undefined;
          break;

        case MESSAGE_SOURCE_TYPE.TASK: {
          const messageSourceTask = this.taskManager.getTask(messageSource.taskId);
          if (messageSourceTask?.originateSource?.sourceType === AGENT_TASK_SOURCE_TYPE.LOOP) {
            agentState.prevLoopMessageTimestamp = Date.now();
          }

          break;
        }

        case MESSAGE_SOURCE_TYPE.AGENT:
        case MESSAGE_SOURCE_TYPE.LOOP:
        case MESSAGE_SOURCE_TYPE.NOTIFICATION:
        case MESSAGE_SOURCE_TYPE.RECOVERY:
        case MESSAGE_SOURCE_TYPE.TASK_RESULT:
        case MESSAGE_SOURCE_TYPE.COMMAND:
        case MESSAGE_SOURCE_TYPE.INTERNAL:
          break;
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
      autoApproveRules,
      decisionReason
    ) => {
      const state = this.ensureState(permAgentId);
      const permissionInfo = { toolUseId, toolName, input, autoApproveRules, decisionReason };

      if (!state.pendingPermissions) {
        state.pendingPermissions = [];
      }

      state.pendingPermissions.push(permissionInfo);

      try {
        return await this.permissionHandler.requestPermission(
          permAgentId,
          toolName,
          input,
          toolUseId,
          autoApproveRules,
          decisionReason
        );
      } finally {
        if (state.pendingPermissions) {
          state.pendingPermissions = state.pendingPermissions.filter((perm) => perm.toolUseId !== toolUseId);
        }
      }
    };

    const questionRequestCallback: QuestionRequestCallback = async (questionAgentId, toolUseId, questions) => {
      const state = this.ensureState(questionAgentId);
      state.pendingQuestion = { toolUseId, questions };
      try {
        await this.persistAgentState(questionAgentId);
      } catch (error) {
        log.error({ agentId: questionAgentId, error }, "Failed to persist state before parking question");
      }

      try {
        return await this.questionHandler.requestQuestion(questionAgentId, toolUseId, questions);
      } finally {
        if (state.pendingQuestion?.toolUseId === toolUseId) {
          state.pendingQuestion = undefined;
          try {
            await this.persistAgentState(questionAgentId);
          } catch (error) {
            log.error({ agentId: questionAgentId, error }, "Failed to persist state after clearing pending question");
          }
        }
      }
    };

    const agentRunner = buildAgentRunner(
      agentId,
      this.registry,
      this.mcpManager,
      this.sensorManager,
      this.circleManager,
      this.fragmentManager,
      permissionRequestCallback,
      questionRequestCallback,
      (streamEvent) => this.handleOobStreamEvent(streamEvent)
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
