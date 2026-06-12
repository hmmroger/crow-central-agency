import { PERMISSION_MODE, SETTING_SOURCE, resolveModel, type PermissionMode } from "@crow-central-agency/shared";
import { CopilotClient } from "@github/copilot-sdk";
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
import { generateId } from "../utils/id-utils.js";
import { DEFAULT_PERMISSION_DENY_MESSAGE, PERMISSION_USER_UNAVAILABLE_MESSAGE } from "../config/constants.js";
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

const log = logger.child({ context: "github-copilot-agent-runner" });

/** Copilot agent interaction mode applied per send. */
type CopilotAgentMode = "interactive" | "plan" | "autopilot";

/** How the current turn resolves permission requests: prompt the user, deny outright, or allow all. */
type PermissionPolicy = "prompt" | "deny" | "allow";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

/** Tool-call arguments arrive as a JSON string (function-call arguments) or an object; normalize to a record. */
function toToolArgsRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return isRecord(value) ? value : {};
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
    const autoApproved = new Set(agentConfig.toolConfig.autoApprovedTools ?? []);
    const { agentMode, policy } = resolvePermissionMode(agentConfig.permissionMode);
    // replace mode drops the SDK's foundation prompt (and guardrails); append layers onto it.
    const systemMessage: SessionConfig["systemMessage"] = systemPrompt
      ? agentConfig.excludeClaudeCodeSystemPrompt
        ? { mode: "replace", content: systemPrompt }
        : { mode: "append", content: systemPrompt }
      : undefined;
    // No onPermissionRequest handler: per the SDK, omitting it surfaces permission requests as
    // events that we resolve from the drain loop via the pending-permission RPC.
    const sessionConfig: SessionConfig = {
      workingDirectory: cwd,
      streaming: true,
      model: resolveModel(agentConfig.model),
      systemMessage,
      // Supports unrestricted tools plus a disallow list for now
      excludedTools: agentConfig.toolConfig.disallowedTools,
      tools: inProcessTools,
      enableConfigDiscovery: agentConfig.settingSources.includes(SETTING_SOURCE.PROJECT),
      mcpServers: this.buildMcpServers(serverConfigs),
      hooks: {
        onPreToolUse: (input) =>
          this.resolveExternalMcpToolPermission(input.toolName, input.toolArgs, serverConfigs, autoApproved, policy),
      },
      onPermissionRequest: undefined,
    };

    const session = sessionId
      ? await client.resumeSession(sessionId, sessionConfig)
      : await client.createSession(sessionConfig);
    this.session = session;

    // this is needed to have permission via event
    await session.rpc.permissions.setRequired({ required: true });

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
      await session.disconnect().catch((error) => {
        log.warn(
          { agentId: this.agentId, sessionId: session.sessionId, error },
          "Failed to disconnect Copilot session"
        );
      });
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

  /** Internal MCP servers become flat in-process tools; auto-approved ones skip the permission prompt. */
  private buildInProcessTools(serverConfigs: CrowMcpServerConfig[]): Tool<Record<string, unknown>>[] {
    return serverConfigs
      .filter((server): server is Extract<CrowMcpServerConfig, { kind: "internal" }> => server.kind === "internal")
      .flatMap((server) => toCopilotTools(server));
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
