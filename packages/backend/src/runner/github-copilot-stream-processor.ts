import type { CopilotClient, SessionEvent } from "@github/copilot-sdk";
import { AGENT_STATUS } from "@crow-central-agency/shared";
import { parseToolActivity } from "./tool-activity-parser.js";
import { AGENT_STREAM_EVENT_TYPE, type AgentStreamEvent } from "./agent-runner.types.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "github-copilot-stream-processor" });

type AssistantEvent = Extract<SessionEvent, { type: `assistant.${string}` }>;
type ToolEvent = Extract<SessionEvent, { type: `tool.${string}` }>;
type SessionLifecycleEvent = Extract<SessionEvent, { type: `session.${string}` }>;
type PermissionEvent = Extract<SessionEvent, { type: `permission.${string}` }>;
type PermissionRequestedEvent = Extract<SessionEvent, { type: "permission.requested" }>;
type McpControlEvent = Extract<SessionEvent, { type: `mcp.${string}` }>;

/** A tool call seen in the stream, used to resolve a later permission request back to its tool name. */
export interface CopilotToolCall {
  toolName: string;
  input: Record<string, unknown>;
}

/** Runner-supplied context for translating events and handling the control-plane ones. */
export interface CopilotEventContext {
  client: CopilotClient;
  agentId: string;
  sessionId: string;
  toolCalls: Map<string, CopilotToolCall>;
  turnStartedAtMs: number;
  configurableInternalToolNames: string[];
  resolvePermission: (event: PermissionRequestedEvent) => Promise<void>;
}

function isAssistantEvent(event: SessionEvent): event is AssistantEvent {
  return event.type.startsWith("assistant.");
}

function isToolEvent(event: SessionEvent): event is ToolEvent {
  return event.type.startsWith("tool.");
}

function isSessionEvent(event: SessionEvent): event is SessionLifecycleEvent {
  return event.type.startsWith("session.");
}

function isPermissionEvent(event: SessionEvent): event is PermissionEvent {
  return event.type.startsWith("permission.");
}

function isMcpControlEvent(event: SessionEvent): event is McpControlEvent {
  return event.type.startsWith("mcp.");
}

/**
 * Map a Copilot SessionEvent to zero or more normalized AgentStreamEvents. Sub-agent events
 * (carrying `agentId`) are skipped — main-agent only, matching the reload transformer. Events are
 * bucketed by top-level genre (assistant/tool/session/permission) so each handler switches over a
 * small union. Async because tool listing and permission resolution both round-trip to the runtime.
 */
export async function mapCopilotSessionEvents(
  context: CopilotEventContext,
  event: SessionEvent
): Promise<AgentStreamEvent[]> {
  if (event.agentId) {
    return [];
  }

  if (isAssistantEvent(event)) {
    return mapAssistantEvent(context, event);
  }

  if (isToolEvent(event)) {
    return mapToolEvent(context, event);
  }

  if (isSessionEvent(event)) {
    return mapSessionEvent(context, event);
  }

  if (isPermissionEvent(event)) {
    return mapPermissionEvent(context, event);
  }

  if (isMcpControlEvent(event)) {
    return mapMcpControlEvent(context, event);
  }

  return [];
}

function mapAssistantEvent(context: CopilotEventContext, event: AssistantEvent): AgentStreamEvent[] {
  const { agentId, sessionId } = context;
  switch (event.type) {
    case "assistant.message_delta":
      return event.data.deltaContent
        ? [{ agentId, type: AGENT_STREAM_EVENT_TYPE.CONTENT, sessionId, content: event.data.deltaContent }]
        : [];

    case "assistant.message":
      return [
        {
          agentId,
          type: AGENT_STREAM_EVENT_TYPE.MESSAGE_DONE,
          sessionId,
          messageId: event.data.messageId,
          message: event,
        },
      ];

    case "assistant.usage": {
      const inputTokens = event.data.inputTokens ?? 0;
      const cacheReadTokens = event.data.cacheReadTokens ?? 0;
      const cacheWriteTokens = event.data.cacheWriteTokens ?? 0;
      return [
        {
          agentId,
          type: AGENT_STREAM_EVENT_TYPE.USAGE,
          sessionId,
          totalInputTokens: inputTokens + cacheReadTokens + cacheWriteTokens,
          inputTokens,
          outputTokens: event.data.outputTokens ?? 0,
        },
      ];
    }

    case "assistant.turn_start":
    case "assistant.intent":
    case "assistant.reasoning":
    case "assistant.reasoning_delta":
    case "assistant.streaming_delta":
    case "assistant.message_start":
    case "assistant.turn_end":
      return [];
  }
}

function mapToolEvent(context: CopilotEventContext, event: ToolEvent): AgentStreamEvent[] {
  const { agentId, sessionId } = context;
  switch (event.type) {
    case "tool.user_requested":
      context.toolCalls.set(event.data.toolCallId, {
        toolName: event.data.toolName,
        input: event.data.arguments ?? {},
      });
      return [];

    case "tool.execution_start": {
      const toolName = event.data.toolName;
      const input = event.data.arguments ?? {};
      context.toolCalls.set(event.data.toolCallId, {
        toolName,
        input,
      });
      return [
        {
          agentId,
          type: AGENT_STREAM_EVENT_TYPE.TOOL_USE,
          sessionId,
          toolName,
          description: parseToolActivity(event.data.toolName, input),
          input,
        },
      ];
    }

    case "tool.execution_complete":
      context.toolCalls.delete(event.data.toolCallId);
      return [];

    case "tool.execution_partial_result":
    case "tool.execution_progress":
      return [];
  }
}

async function mapSessionEvent(
  context: CopilotEventContext,
  event: SessionLifecycleEvent
): Promise<AgentStreamEvent[]> {
  const { client, agentId, sessionId, turnStartedAtMs } = context;
  switch (event.type) {
    case "session.compaction_start":
      return [{ agentId, type: AGENT_STREAM_EVENT_TYPE.STATUS, sessionId, status: AGENT_STATUS.COMPACTING }];

    case "session.idle": {
      if (event.data.aborted) {
        return [];
      }

      // event.timestamp is the SDK's ISO 8601 idle time; guard against a malformed value yielding NaN.
      const endedAtMs = Date.parse(event.timestamp);
      const durationMs = Number.isFinite(endedAtMs) ? Math.max(0, endedAtMs - turnStartedAtMs) : 0;
      return [
        {
          agentId,
          type: AGENT_STREAM_EVENT_TYPE.DONE,
          sessionId,
          isSuccess: true,
          doneType: "idle",
          durationMs,
        },
      ];
    }

    case "session.error":
      return [{ agentId, type: AGENT_STREAM_EVENT_TYPE.ERROR, sessionId, error: event.data.message }];

    case "session.tools_updated": {
      const discoveredTools = await listDiscoverableTools(
        client,
        event.data.model,
        context.configurableInternalToolNames
      );
      return [{ agentId, type: AGENT_STREAM_EVENT_TYPE.TOOLS_DISCOVERED, sessionId, discoveredTools }];
    }

    case "session.mcp_servers_loaded": {
      for (const server of event.data.servers) {
        const logFields = { agentId, sessionId, server: server.name, status: server.status, error: server.error };
        if (server.status === "connected") {
          log.info(logFields, "MCP server connected");
        } else {
          log.warn(logFields, "MCP server not connected");
        }
      }

      return [];
    }

    case "session.mcp_server_status_changed":
      log.info(
        { agentId, sessionId, server: event.data.serverName, status: event.data.status, error: event.data.error },
        "MCP server status changed"
      );
      return [];

    case "session.start":
    case "session.resume":
    case "session.remote_steerable_changed":
    case "session.title_changed":
    case "session.schedule_created":
    case "session.schedule_cancelled":
    case "session.info":
    case "session.warning":
    case "session.model_change":
    case "session.mode_changed":
    case "session.plan_changed":
    case "session.permissions_changed":
    case "session.workspace_file_changed":
    case "session.handoff":
    case "session.truncation":
    case "session.snapshot_rewind":
    case "session.shutdown":
    case "session.context_changed":
    case "session.usage_info":
    case "session.compaction_complete":
    case "session.task_complete":
    case "session.custom_notification":
    case "session.background_tasks_changed":
    case "session.skills_loaded":
    case "session.custom_agents_updated":
    case "session.autopilot_objective_changed":
    case "session.extensions_loaded":
    case "session.extensions.attachments_pushed":
    case "session.canvas.opened":
    case "session.canvas.registry_changed":
      return [];
  }
}

async function mapPermissionEvent(context: CopilotEventContext, event: PermissionEvent): Promise<AgentStreamEvent[]> {
  switch (event.type) {
    case "permission.requested":
      await context.resolvePermission(event);
      return [];

    case "permission.completed":
      return [];
  }
}

function mapMcpControlEvent(context: CopilotEventContext, event: McpControlEvent): AgentStreamEvent[] {
  const { agentId, sessionId } = context;
  switch (event.type) {
    case "mcp.oauth_required":
      log.warn(
        { agentId, sessionId, server: event.data.serverName, serverUrl: event.data.serverUrl },
        "MCP server requires OAuth, which is not handled yet — its tools are unavailable"
      );
      return [];

    case "mcp.oauth_completed":
      return [];
  }
}

/** Built-in tools (`rpc.tools.list` is built-ins only) plus our internal MCP tool names, for the editor list. */
async function listDiscoverableTools(client: CopilotClient, model: string, mcpToolNames: string[]): Promise<string[]> {
  try {
    // External MCP tools can't be enumerated by the SDK (upstream github/copilot-sdk#1143), so only ours are added.
    const { tools } = await client.rpc.tools.list({ model });
    return [...tools.map((tool) => tool.name), ...mcpToolNames];
  } catch (error) {
    log.warn({ model, error }, "Failed to list Copilot tools");
    return [...mcpToolNames];
  }
}
