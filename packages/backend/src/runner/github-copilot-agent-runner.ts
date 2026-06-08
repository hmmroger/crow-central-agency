import { CopilotClient } from "@github/copilot-sdk";
import type { CopilotSession, PermissionRequestResult, SessionConfig, SessionEvent } from "@github/copilot-sdk";
import { AgentRunner } from "./agent-runner.js";
import {
  mapCopilotSessionEvents,
  type CopilotEventContext,
  type CopilotToolCall,
} from "./github-copilot-stream-processor.js";
import { generateId } from "../utils/id-utils.js";
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

const log = logger.child({ context: "github-copilot-agent-runner" });

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
    _oobEventCallback: OOBStreamEventCallback
  ) {
    super(agentId, registry, mcpManager, sensorManager, circleManager);
  }

  protected async *runProviderQuery(request: AgentRunQueryRequest): AsyncGenerator<AgentStreamEvent, void, unknown> {
    const { message, cwd, agentConfig, systemPrompt, timezone, sessionId, abortController } = request;

    const client = await this.getClient();
    // No onPermissionRequest handler: per the SDK, omitting it surfaces permission requests as
    // events that we resolve from the drain loop via the pending-permission RPC.
    const sessionConfig: SessionConfig = {
      workingDirectory: cwd,
      streaming: true,
      systemMessage: systemPrompt ? { mode: "append", content: systemPrompt } : undefined,
      // Supports unrestricted tools plus a disallow list for now
      excludedTools: agentConfig.toolConfig.disallowedTools,
    };

    const session = sessionId
      ? await client.resumeSession(sessionId, sessionConfig)
      : await client.createSession(sessionConfig);
    this.session = session;

    // toolCallId -> tool name/input, populated from the event stream so permission requests
    // (which only carry a toolCallId) can be resolved back to a tool name.
    const toolCalls = new Map<string, CopilotToolCall>();
    const autoApproved = new Set(agentConfig.toolConfig.autoApprovedTools ?? []);
    const context: CopilotEventContext = {
      client,
      agentId: this.agentId,
      sessionId: session.sessionId,
      toolCalls,
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
    autoApproved: ReadonlySet<string>
  ): Promise<void> {
    const { requestId, permissionRequest, resolvedByHook } = event.data;
    if (resolvedByHook) {
      return;
    }

    const toolCallId = "toolCallId" in permissionRequest ? permissionRequest.toolCallId : undefined;
    const toolCall = toolCallId ? toolCalls.get(toolCallId) : undefined;
    const toolName = toolCall?.toolName ?? permissionRequest.kind;

    let result: Exclude<PermissionRequestResult, { kind: "no-result" }>;
    if (autoApproved.has(toolName)) {
      result = { kind: "approve-once" };
    } else {
      const decision = await this.permissionRequestHandler(
        this.agentId,
        toolName,
        toolCall?.input ?? {},
        toolCallId ?? generateId()
      );
      result =
        decision.behavior === "allow" ? { kind: "approve-once" } : { kind: "reject", feedback: decision.message };
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
