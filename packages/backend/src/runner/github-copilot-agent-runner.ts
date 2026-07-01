import path from "node:path";
import {
  AGENT_COMMAND,
  AGENT_STATUS,
  MESSAGE_SOURCE_TYPE,
  PERMISSION_MODE,
  REASONING_EFFORT,
  SETTING_SOURCE,
  TOOL_MODE,
  resolveModel,
  type AgentCommand,
  type AgentConfig,
  type PermissionMode,
  type ReasoningEffort,
} from "@crow-central-agency/shared";
import { CopilotClient, ToolSet } from "@github/copilot-sdk";
import type {
  CopilotSession,
  MCPServerConfig,
  PermissionRequestResult,
  SessionConfig,
  SessionEvent,
  Tool,
} from "@github/copilot-sdk";
import { AgentRunner } from "./agent-runner.js";
import {
  mapCopilotSessionEvents,
  type CopilotEventContext,
  type CopilotToolCall,
} from "./github-copilot-stream-processor.js";
import { expandPath } from "../utils/fs-utils.js";
import { generateId } from "../utils/id-utils.js";
import {
  COPILOT_DEFAULT_HOME_DIR_NAME,
  COPILOT_HOME_ENV,
  COPILOT_SKILLS_DIR_NAME,
  DEFAULT_PERMISSION_DENY_MESSAGE,
  PERMISSION_USER_UNAVAILABLE_MESSAGE,
} from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { userMessageForAgent } from "../utils/message-template.js";
import {
  AGENT_STREAM_EVENT_TYPE,
  type AgentRunQueryRequest,
  type AgentStreamEvent,
  type OOBStreamEventCallback,
  type PermissionRequestCallback,
} from "./agent-runner.types.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { CrowMcpManager } from "../mcp/crow-mcp-manager.js";
import type { SensorManager } from "../sensors/sensor-manager.js";
import type { AgentCircleManager } from "../services/agent-circle-manager.js";
import type { CrowMcpServerConfig } from "../mcp/crow-mcp-manager.types.js";
import { toCopilotMcpServer, toCopilotTools } from "../mcp/copilot-mcp-adapter.js";
import { toToolArgsRecord } from "./tool-activity-parser-utils.js";

const log = logger.child({ context: "github-copilot-agent-runner" });

/** DONE event subtype reported when a compact command finishes. */
const COMPACT_DONE_TYPE = "compact";

/** Copilot agent interaction mode applied per send. */
type CopilotAgentMode = "interactive" | "plan" | "autopilot";

/** How the current turn resolves permission requests: prompt the user, deny outright, or allow all. */
type PermissionPolicy = "prompt" | "deny" | "allow";

/** Copilot's reasoning effort levels, derived from the SDK's session config (no `max`; not exported by name). */
type CopilotReasoningEffort = NonNullable<SessionConfig["reasoningEffort"]>;

/**
 * Map a shared reasoning effort to Copilot's narrower set. `max` is Claude-only, so it collapses to
 * Copilot's deepest level (`xhigh`) to preserve the "deepest" intent; undefined keeps the model default.
 */
function toCopilotReasoningEffort(effort: ReasoningEffort | undefined): CopilotReasoningEffort | undefined {
  if (!effort) {
    return undefined;
  }

  return effort === REASONING_EFFORT.MAX ? REASONING_EFFORT.XHIGH : effort;
}

/**
 * Map the agent's permission mode to a Copilot send mode plus how we resolve permission requests.
 * `dontAsk` stays interactive but denies every request since no user is reachable; `bypassPermissions`
 * runs autopilot and allows everything, including our external-MCP gate. Copilot has no preset
 * accept-edits equivalent, and its plan-mode exit isn't wired yet (the exit request would never be
 * answered and the turn would stall), so both fall back to the default interactive + prompt behavior.
 */
function resolvePermissionMode(permissionMode: PermissionMode): {
  agentMode: CopilotAgentMode;
  policy: PermissionPolicy;
} {
  switch (permissionMode) {
    case PERMISSION_MODE.DONT_ASK:
      return { agentMode: "interactive", policy: "deny" };
    case PERMISSION_MODE.BYPASS_PERMISSIONS:
      return { agentMode: "autopilot", policy: "allow" };
    case PERMISSION_MODE.DEFAULT:
    case PERMISSION_MODE.ACCEPT_EDITS:
    case PERMISSION_MODE.PLAN:
      return { agentMode: "interactive", policy: "prompt" };
  }
}

/**
 * User-level skills live under the Copilot home (`COPILOT_HOME`, else `~/.copilot`).
 */
function userSkillDirectory(): string {
  const copilotHome = expandPath(process.env[COPILOT_HOME_ENV] ?? `~/${COPILOT_DEFAULT_HOME_DIR_NAME}`);
  return path.join(copilotHome, COPILOT_SKILLS_DIR_NAME);
}

/** Match a tool name against the auto-approve patterns, where a trailing `*` matches by prefix (`*` matches all). */
function isToolAutoApproved(patterns: Set<string>, toolName: string): boolean {
  if (patterns.has(toolName)) {
    return true;
  }

  for (const pattern of patterns) {
    if (pattern.endsWith("*") && toolName.startsWith(pattern.slice(0, -1))) {
      return true;
    }
  }

  return false;
}

/**
 * GitHub Copilot agent runner. Drives a `@github/copilot-sdk` session per turn and bridges its
 * push-based events into the base runner's pull-based AgentStreamEvent generator. Tool permissions
 * route through the shared permission handler, auto-approving the tools configured on the agent.
 */
export class GithubCopilotAgentRunner extends AgentRunner {
  private clientPromise?: Promise<CopilotClient>;
  private session?: CopilotSession;

  constructor(
    agentId: string,
    registry: AgentRegistry,
    mcpManager: CrowMcpManager,
    sensorManager: SensorManager,
    circleManager: AgentCircleManager,
    private readonly permissionRequestHandler: PermissionRequestCallback,
    private readonly oobEventCallback: OOBStreamEventCallback
  ) {
    super(agentId, registry, mcpManager, sensorManager, circleManager);
  }

  protected async *runProviderQuery(request: AgentRunQueryRequest): AsyncGenerator<AgentStreamEvent, void, unknown> {
    const { messageSource } = request;
    if (messageSource.sourceType === MESSAGE_SOURCE_TYPE.COMMAND) {
      yield* this.runCommand(request, messageSource.command);
      return;
    }

    const {
      message,
      cwd,
      agentConfig,
      systemPrompt,
      instructionReminder,
      timezone,
      serverConfigs,
      sessionId,
      abortController,
    } = request;

    const client = await this.getClient(cwd);
    const inProcessTools = this.buildInProcessTools(serverConfigs);
    const availableTools = this.buildAvailableTools(agentConfig.toolConfig);
    const autoApproved = new Set(agentConfig.toolConfig.autoApprovedTools ?? []);
    const { agentMode, policy } = resolvePermissionMode(agentConfig.permissionMode);
    // replace mode drops the SDK's foundation prompt (and guardrails); append layers onto it.
    const systemMessage: SessionConfig["systemMessage"] = systemPrompt
      ? agentConfig.excludeClaudeCodeSystemPrompt
        ? { mode: "replace", content: systemPrompt }
        : { mode: "append", content: systemPrompt }
      : undefined;
    const enableConfigDiscovery = agentConfig.settingSources.includes(SETTING_SOURCE.PROJECT);
    // No onPermissionRequest handler: per the SDK, omitting it surfaces permission requests as
    // events that we resolve from the drain loop via the pending-permission RPC.
    const sessionConfig: SessionConfig = {
      workingDirectory: cwd,
      streaming: true,
      model: resolveModel(agentConfig.model),
      reasoningEffort: toCopilotReasoningEffort(agentConfig.effort),
      reasoningSummary: "detailed",
      systemMessage,
      // Restricted mode gates builtins via availableTools; disallowedTools always wins via excludedTools.
      availableTools,
      excludedTools: agentConfig.toolConfig.disallowedTools,
      tools: inProcessTools,
      enableConfigDiscovery,
      enableSkills: true,
      skillDirectories:
        !enableConfigDiscovery && agentConfig.settingSources.includes(SETTING_SOURCE.USER)
          ? [userSkillDirectory()]
          : undefined,
      enableFileHooks: !agentConfig.settingSourceConfig?.disableFileHooks,
      disabledSkills: agentConfig.settingSourceConfig?.disabledSkills,
      mcpServers: this.buildMcpServers(serverConfigs),
      hooks: {
        onPreToolUse: async (input, invocation) => {
          const permission = await this.resolveExternalMcpToolPermission(
            input.toolName,
            input.toolArgs,
            serverConfigs,
            autoApproved,
            policy
          );
          const additionalContext = this.drainInjectedContextForHook(input, invocation);
          if (!permission && !additionalContext) {
            return undefined;
          }

          return { ...permission, ...(additionalContext ? { additionalContext } : {}) };
        },
        onPostToolUse: (input, invocation) => {
          const additionalContext = this.drainInjectedContextForHook(input, invocation);
          return additionalContext ? { additionalContext } : undefined;
        },
        onPostToolUseFailure: (input, invocation) => {
          const additionalContext = this.drainInjectedContextForHook(input, invocation);
          return additionalContext ? { additionalContext } : undefined;
        },
      },
      onPermissionRequest: undefined,
    };

    const session =
      sessionId && agentConfig.persistSession !== false
        ? await client.resumeSession(sessionId, sessionConfig)
        : await client.createSession(sessionConfig);
    this.session = session;

    // toolCallId -> tool name/input, populated from the event stream so permission requests
    // (which only carry a toolCallId) can be resolved back to a tool name.
    const toolCalls = new Map<string, CopilotToolCall>();
    const context: CopilotEventContext = {
      client,
      agentId: this.agentId,
      sessionId: session.sessionId,
      toolCalls,
      turnStartedAtMs: Date.now(),
      // Auto-approved internal tools skip permission and stay hidden; configurable ones surface for management.
      configurableInternalToolNames: inProcessTools.filter((tool) => !tool.skipPermission).map((tool) => tool.name),
      resolvePermission: (event) => this.resolvePermission(session, event, toolCalls, autoApproved, policy),
    };

    try {
      // this is needed to have permission via event
      await session.rpc.permissions.setRequired({ required: true });
      const skillList = await session.rpc.skills.list();
      const discoveredSkills = skillList.skills.map((skill) => ({ name: skill.name, source: skill.source }));
      yield {
        agentId: this.agentId,
        type: AGENT_STREAM_EVENT_TYPE.SKILLS_DISCOVERED,
        sessionId: session.sessionId,
        discoveredSkills,
      };

      const instSources = (await session.rpc.instructions.getSources()).sources.map((source) => source.id);
      yield {
        agentId: this.agentId,
        type: AGENT_STREAM_EVENT_TYPE.INSTRUCTION_SOURCES,
        sessionId: session.sessionId,
        instructionSources: instSources,
      };
      await this.applyDisabledInstructionSources(session, agentConfig, instSources);

      const prompt = userMessageForAgent(new Date(), message, timezone, instructionReminder);
      let initEmitted = false;
      let turnComplete = false;
      for await (const event of this.iterateSessionEvents(session, abortController, prompt, agentMode)) {
        // Copilot has no per-query init message; the turn has begun once the first event arrives.
        if (!initEmitted) {
          initEmitted = true;
          yield { agentId: this.agentId, type: AGENT_STREAM_EVENT_TYPE.INIT, sessionId: session.sessionId };
        }

        for (const agentStreamEvent of await mapCopilotSessionEvents(context, event)) {
          if (agentStreamEvent.type === AGENT_STREAM_EVENT_TYPE.DONE) {
            turnComplete = true;
          }

          yield agentStreamEvent;
        }

        // The pump stays a dumb queue; the turn ends when the dispatcher emits DONE (from idle) or
        // the abort signal stops the generator. Break so its finally tears the session down.
        if (turnComplete) {
          break;
        }
      }
    } finally {
      this.session = undefined;
      const finishedSessionId = session.sessionId;
      await this.disconnectSession(session);
      if (agentConfig.persistSession === false) {
        await this.deleteSession(client, finishedSessionId);
      }
    }
  }

  protected async cancelProviderQuery(): Promise<void> {
    await this.session?.abort();
  }

  /** Stop this agent's cached Copilot client (and its CLI server process) when the agent is removed. */
  public override async dispose(): Promise<void> {
    const clientPromise = this.clientPromise;
    this.clientPromise = undefined;
    if (!clientPromise) {
      return;
    }

    try {
      const client = await clientPromise;
      const errors = await client.stop();
      if (errors.length > 0) {
        log.warn({ agentId: this.agentId, errors }, "Errors while stopping Copilot client");
      }
    } catch (error) {
      log.warn({ agentId: this.agentId, error }, "Failed to stop Copilot client during dispose");
    }
  }

  /**
   * Run an operator command against the existing session. Compaction resumes the session and drives
   * `rpc.history.compact()` directly — no `send()` turn — bracketing it with INIT/COMPACTING/DONE so
   * the runtime broadcasts status the same way as a normal turn. A USAGE event resets the token
   * display to the context retained after compaction.
   */
  private async *runCommand(
    request: AgentRunQueryRequest,
    command: AgentCommand
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    const { cwd, sessionId, agentConfig, message } = request;
    if (command !== AGENT_COMMAND.COMPACT) {
      log.warn({ agentId: this.agentId, command }, "Unknown agent command; skipping");
      return;
    }

    if (!sessionId) {
      log.warn({ agentId: this.agentId, command }, "No active session to compact; skipping");
      return;
    }

    const client = await this.getClient(cwd);
    const session = await client.resumeSession(sessionId, {
      workingDirectory: cwd,
      model: resolveModel(agentConfig.model),
    });
    this.session = session;
    const startedAtMs = Date.now();
    try {
      yield { agentId: this.agentId, type: AGENT_STREAM_EVENT_TYPE.INIT, sessionId: session.sessionId };
      yield {
        agentId: this.agentId,
        type: AGENT_STREAM_EVENT_TYPE.STATUS,
        sessionId: session.sessionId,
        status: AGENT_STATUS.COMPACTING,
      };
      const steering = message.trim();
      const result = await session.rpc.history.compact(steering ? { customInstructions: steering } : undefined);
      log.info(
        { agentId: this.agentId, tokensRemoved: result.tokensRemoved, messagesRemoved: result.messagesRemoved },
        "Compacted Copilot session"
      );
      yield {
        agentId: this.agentId,
        type: AGENT_STREAM_EVENT_TYPE.USAGE,
        sessionId: session.sessionId,
        totalInputTokens: result.contextWindow?.currentTokens ?? 0,
        inputTokens: result.contextWindow?.currentTokens ?? 0,
        outputTokens: 0,
      };
      yield {
        agentId: this.agentId,
        type: AGENT_STREAM_EVENT_TYPE.DONE,
        sessionId: session.sessionId,
        isSuccess: result.success,
        doneType: COMPACT_DONE_TYPE,
        durationMs: Date.now() - startedAtMs,
      };
    } finally {
      this.session = undefined;
      await this.disconnectSession(session);
    }
  }

  /** Disconnect a Copilot session, swallowing teardown failures with a warning. */
  private async disconnectSession(session: CopilotSession): Promise<void> {
    await session.disconnect().catch((error) => {
      log.warn({ agentId: this.agentId, sessionId: session.sessionId, error }, "Failed to disconnect Copilot session");
    });
  }

  /** Permanently delete a Copilot session's on-disk data, swallowing failures with a warning. */
  private async deleteSession(client: CopilotClient, sessionId: string): Promise<void> {
    await client.deleteSession(sessionId).catch((error) => {
      log.warn({ agentId: this.agentId, sessionId, error }, "Failed to delete Copilot session");
    });
  }

  /**
   * Disable the instruction sources the agent has opted out of, intersected with this run's live
   * source set. Skips the RPC entirely when nothing resolves to disable.
   */
  private async applyDisabledInstructionSources(
    session: CopilotSession,
    agentConfig: AgentConfig,
    instSources: string[]
  ): Promise<void> {
    const disabledSelection = agentConfig.settingSourceConfig?.disabledInstructionSources ?? [];
    const disabledInstructionSources = disabledSelection.filter((id) => instSources.includes(id));
    if (disabledInstructionSources.length === 0) {
      return;
    }

    await session.rpc.options.update({ disabledInstructionSources });
  }

  /** Internal MCP servers become flat in-process tools; auto-approved ones skip the permission prompt. */
  private buildInProcessTools(serverConfigs: CrowMcpServerConfig[]): Tool<Record<string, unknown>>[] {
    return serverConfigs
      .filter((server): server is Extract<CrowMcpServerConfig, { kind: "internal" }> => server.kind === "internal")
      .flatMap((server) => toCopilotTools(server));
  }

  /**
   * Restricted mode: allow only the selected builtins, keeping our in-process (custom) and MCP tools,
   * since Copilot's availableTools allowlist filters every source. Unrestricted mode leaves it unset so
   * all builtins remain available.
   */
  private buildAvailableTools(toolConfig: AgentConfig["toolConfig"]): ToolSet | undefined {
    if (toolConfig.mode !== TOOL_MODE.RESTRICTED) {
      return undefined;
    }

    return new ToolSet()
      .addBuiltIn(toolConfig.tools ?? [])
      .addCustom("*")
      .addMcp("*");
  }

  /** User-configured (external) MCP servers are passed through as Copilot MCP server configs. */
  private buildMcpServers(serverConfigs: CrowMcpServerConfig[]): Record<string, MCPServerConfig> {
    const mcpServers: Record<string, MCPServerConfig> = {};
    for (const server of serverConfigs) {
      if (server.kind === "external") {
        mcpServers[server.name] = toCopilotMcpServer(server.transport);
      }
    }

    return mcpServers;
  }

  /**
   * Bridge the SDK's callback events into an async generator: subscribe, send, then yield events as
   * they arrive. The callback stays a dumb pump (enqueue + signal only); the consumer stops the
   * generator once the dispatcher emits DONE, and abort or a send failure end it early. `send()` runs
   * without awaiting it before the loop — it may not settle until the turn ends, and awaiting it would
   * buffer every streamed delta until then.
   */
  private async *iterateSessionEvents(
    session: CopilotSession,
    abortController: AbortController,
    prompt: string,
    agentMode: CopilotAgentMode
  ): AsyncGenerator<SessionEvent, void, unknown> {
    const queue: SessionEvent[] = [];
    let wake: (() => void) | undefined;
    let finished = false;
    let sendError: unknown;

    const signalNext = (): void => {
      wake?.();
      wake = undefined;
    };

    const unsubscribe = session.on((event) => {
      queue.push(event);
      signalNext();
    });

    const onAbort = (): void => {
      finished = true;
      signalNext();
    };

    abortController.signal.addEventListener("abort", onAbort);

    const sendSettled = session.send({ prompt, agentMode }).catch((error: unknown) => {
      log.error(
        {
          agentId: this.agentId,
          sessionId: session.sessionId,
          agentMode,
          error: error instanceof Error ? error.message : String(error),
        },
        "Copilot send failed"
      );
      sendError = error;
      finished = true;
      signalNext();
    });

    try {
      while (true) {
        while (queue.length > 0) {
          const event = queue.shift();
          if (event) {
            yield event;
          }
        }

        if (sendError !== undefined) {
          throw sendError;
        }

        if (finished) {
          return;
        }

        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      unsubscribe();
      abortController.signal.removeEventListener("abort", onAbort);
      await sendSettled;
    }
  }

  /**
   * Drain buffered injected messages as model-facing additionalContext at a tool boundary.
   * Main agent only — sub-agent tool calls carry a different runtime sessionId than the
   * session the hook is registered on, and main-thread guidance must not leak into them.
   */
  private drainInjectedContextForHook(
    input: { sessionId: string },
    invocation: { sessionId: string }
  ): string | undefined {
    if (input.sessionId !== invocation.sessionId) {
      return undefined;
    }

    return this.drainInjectedMessages();
  }

  private async resolveExternalMcpToolPermission(
    toolName: string,
    toolArgs: unknown,
    serverConfigs: CrowMcpServerConfig[],
    autoApproved: Set<string>,
    policy: PermissionPolicy
  ): Promise<{ permissionDecision: "allow" | "deny"; permissionDecisionReason?: string } | undefined> {
    const isExternalMcpTool = serverConfigs.some(
      (server) => server.kind === "external" && toolName.startsWith(server.mcpToolPrefix)
    );
    if (!isExternalMcpTool) {
      return undefined;
    }

    if (policy === "allow" || isToolAutoApproved(autoApproved, toolName)) {
      return { permissionDecision: "allow" };
    }

    if (policy === "deny") {
      return { permissionDecision: "deny", permissionDecisionReason: PERMISSION_USER_UNAVAILABLE_MESSAGE };
    }

    const decision = await this.permissionRequestHandler(
      this.agentId,
      toolName,
      toToolArgsRecord(toolArgs),
      generateId()
    );
    if (decision.behavior === "allow_always") {
      this.rememberAutoApproval(toolName, autoApproved);
    }

    return decision.behavior === "deny"
      ? { permissionDecision: "deny", permissionDecisionReason: decision.message ?? DEFAULT_PERMISSION_DENY_MESSAGE }
      : { permissionDecision: "allow" };
  }

  /** Remember an "allow always" decision for this query and emit the event so the runtime persists it. */
  private rememberAutoApproval(toolName: string, autoApproved: Set<string>): void {
    autoApproved.add(toolName);
    this.oobEventCallback({
      type: AGENT_STREAM_EVENT_TYPE.TOOL_AUTO_APPROVED,
      agentId: this.agentId,
      sessionId: this.session?.sessionId ?? "",
      toolName,
    });
  }

  /**
   * Resolve a permission request from the event stream. Copilot requests permission by category
   * (shell/write/...) carrying only a toolCallId, so we resolve that to a tool name via `toolCalls`,
   * auto-approve the tools the agent configured, otherwise route through the shared permission
   * handler, then answer the runtime over RPC.
   */
  private async resolvePermission(
    session: CopilotSession,
    event: Extract<SessionEvent, { type: "permission.requested" }>,
    toolCalls: Map<string, CopilotToolCall>,
    autoApproved: Set<string>,
    policy: PermissionPolicy
  ): Promise<void> {
    const { requestId, permissionRequest, resolvedByHook } = event.data;
    if (resolvedByHook) {
      return;
    }

    const toolCallId = "toolCallId" in permissionRequest ? permissionRequest.toolCallId : undefined;
    const toolCall = toolCallId ? toolCalls.get(toolCallId) : undefined;
    const toolName =
      toolCall?.toolName ??
      (permissionRequest.kind === "custom-tool" || permissionRequest.kind === "mcp" || permissionRequest.kind === "hook"
        ? permissionRequest.toolName
        : permissionRequest.kind);

    let result: Exclude<PermissionRequestResult, { kind: "no-result" }>;
    if (policy === "allow" || isToolAutoApproved(autoApproved, toolName)) {
      result = { kind: "approve-once" };
    } else if (policy === "deny") {
      result = { kind: "reject", feedback: PERMISSION_USER_UNAVAILABLE_MESSAGE };
    } else {
      const decision = await this.permissionRequestHandler(
        this.agentId,
        toolName,
        toolCall?.input ?? {},
        toolCallId ?? generateId()
      );
      if (decision.behavior === "allow_always") {
        this.rememberAutoApproval(toolName, autoApproved);
      }

      result =
        decision.behavior === "deny"
          ? { kind: "reject", feedback: decision.message ?? DEFAULT_PERMISSION_DENY_MESSAGE }
          : { kind: "approve-once" };
    }

    await session.rpc.permissions.handlePendingPermissionRequest({ requestId, result });
  }

  /** Lazily start this agent's own Copilot client (one per agent keeps team agents isolated). */
  private getClient(cwd: string): Promise<CopilotClient> {
    if (!this.clientPromise) {
      this.clientPromise = this.createClient(cwd).catch((error) => {
        this.clientPromise = undefined;
        throw error;
      });
    }

    return this.clientPromise;
  }

  private async createClient(cwd: string): Promise<CopilotClient> {
    const client = new CopilotClient({ workingDirectory: cwd });
    await client.start();
    return client;
  }
}
