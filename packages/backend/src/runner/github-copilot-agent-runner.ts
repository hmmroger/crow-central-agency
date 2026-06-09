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
import { DEFAULT_PERMISSION_DENY_MESSAGE } from "../config/constants.js";
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
    const { message, cwd, agentConfig, systemPrompt, timezone, serverConfigs, sessionId, abortController } = request;

    const client = await this.getClient();
    const inProcessTools = this.buildInProcessTools(serverConfigs);
    const autoApproved = new Set(agentConfig.toolConfig.autoApprovedTools ?? []);
    // No onPermissionRequest handler: per the SDK, omitting it surfaces permission requests as
    // events that we resolve from the drain loop via the pending-permission RPC.
    const sessionConfig: SessionConfig = {
      workingDirectory: cwd,
      streaming: true,
      systemMessage: systemPrompt ? { mode: "append", content: systemPrompt } : undefined,
      // Supports unrestricted tools plus a disallow list for now
      excludedTools: agentConfig.toolConfig.disallowedTools,
      tools: inProcessTools,
      mcpServers: this.buildMcpServers(serverConfigs),
      hooks: {
        onPreToolUse: (input) =>
          this.resolveExternalMcpToolPermission(input.toolName, input.toolArgs, serverConfigs, autoApproved),
      },
    };

    const session = sessionId
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
      resolvePermission: (event) => this.resolvePermission(session, event, toolCalls, autoApproved),
    };

    try {
      const prompt = userMessageForAgent(new Date(), message, timezone);
      let initEmitted = false;
      let turnComplete = false;
      for await (const event of this.iterateSessionEvents(session, abortController, prompt)) {
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
    prompt: string
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

    const sendSettled = session.send({ prompt }).catch((error: unknown) => {
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
    autoApproved: Set<string>
  ): Promise<{ permissionDecision: "allow" | "deny"; permissionDecisionReason?: string } | undefined> {
    const isExternalMcpTool = serverConfigs.some(
      (server) => server.kind === "external" && toolName.startsWith(server.mcpToolPrefix)
    );
    if (!isExternalMcpTool) {
      return undefined;
    }

    if (isToolAutoApproved(autoApproved, toolName)) {
      return { permissionDecision: "allow" };
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
    autoApproved: Set<string>
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
    if (isToolAutoApproved(autoApproved, toolName)) {
      result = { kind: "approve-once" };
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
  private getClient(): Promise<CopilotClient> {
    if (!this.clientPromise) {
      this.clientPromise = this.createClient().catch((error) => {
        this.clientPromise = undefined;
        throw error;
      });
    }

    return this.clientPromise;
  }

  private async createClient(): Promise<CopilotClient> {
    const client = new CopilotClient();
    await client.start();
    return client;
  }
}
