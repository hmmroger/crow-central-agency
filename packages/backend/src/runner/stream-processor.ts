import type { SDKMessage, Query } from "@anthropic-ai/claude-agent-sdk";
import { AGENT_STATUS } from "@crow-central-agency/shared";
import { logger } from "../utils/logger.js";
import { AGENT_STREAM_EVENT_TYPE, type AgentStreamEvent, type AgentStreamUsage } from "./agent-runner.types.js";

const log = logger.child({ context: "stream-processor" });

export async function* processStream(
  agentId: string,
  queryStream: Query,
  internalMcpPrefixes: string[]
): AsyncGenerator<AgentStreamEvent> {
  for await (const message of queryStream) {
    yield* handleMessage(agentId, message, internalMcpPrefixes);
  }
}

function handleMessage(agentId: string, message: SDKMessage, internalMcpPrefixes: string[]): AgentStreamEvent[] {
  switch (message.type) {
    case "system":
      return handleSystemMessage(agentId, message, internalMcpPrefixes);

    case "stream_event":
      return handleStreamEvent(agentId, message);

    case "assistant":
      return handleAssistantMessage(agentId, message);

    case "result":
      return handleResultMessage(agentId, message);

    case "tool_progress":
      return handleToolProgress(agentId, message);

    case "rate_limit_event":
      return [
        {
          agentId,
          type: AGENT_STREAM_EVENT_TYPE.RATE_LIMIT_INFO,
          sessionId: message.session_id,
          rateLimitStatus: message.rate_limit_info.status,
          rateLimitType: message.rate_limit_info.rateLimitType,
        },
      ];

    case "user":
    case "auth_status":
    case "tool_use_summary":
    case "prompt_suggestion":
    default:
      log.debug({ agentId, type: message.type, sessionId: message.session_id }, "Unhandled SDK message received");
      return [];
  }
}

/** Handle system messages (init, status, compact_boundary) */
function handleSystemMessage(
  agentId: string,
  message: SDKMessage & { type: "system" },
  internalMcpPrefixes: string[]
): AgentStreamEvent[] {
  if (!message.subtype) {
    return [];
  }

  log.debug(
    { agentId, type: message.type, subtype: message.subtype, sessionId: message.session_id },
    "handleSystemMessage"
  );

  switch (message.subtype) {
    case "init": {
      log.info({ agentId, sessionId: message.session_id, tools: message.tools.length }, "Session initialized");
      const discoveredTools = message.tools.filter(
        (tool) => !internalMcpPrefixes.some((prefix) => tool.startsWith(prefix))
      );

      return [
        {
          agentId,
          type: AGENT_STREAM_EVENT_TYPE.INIT,
          sessionId: message.session_id,
        },
        {
          agentId,
          type: AGENT_STREAM_EVENT_TYPE.TOOLS_DISCOVERED,
          sessionId: message.session_id,
          discoveredTools,
        },
      ];
    }

    case "status": {
      if (message.status === "compacting") {
        return [
          {
            agentId,
            type: AGENT_STREAM_EVENT_TYPE.STATUS,
            sessionId: message.session_id,
            status: AGENT_STATUS.COMPACTING,
          },
        ];
      }

      break;
    }

    case "compact_boundary": {
      log.info({ agentId }, "Compact boundary reached");
      const postTokens = message.compact_metadata.post_tokens;
      if (postTokens === undefined) {
        log.warn({ agentId }, "Compact boundary missing post_tokens; skipping usage reset");
        return [];
      }

      return [
        {
          agentId,
          type: AGENT_STREAM_EVENT_TYPE.USAGE,
          sessionId: message.session_id,
          totalInputTokens: postTokens,
          inputTokens: postTokens,
          outputTokens: 0,
        },
      ];
    }

    case "local_command_output":
    case "hook_started":
    case "hook_progress":
    case "hook_response":
    case "task_notification":
    case "task_started":
    case "task_progress":
    case "task_updated":
    case "files_persisted":
    case "elicitation_complete":
    case "api_retry":
    case "commands_changed":
    case "memory_recall":
    case "mirror_error":
    case "model_refusal_fallback":
    case "notification":
    case "permission_denied":
    case "plugin_install":
    case "session_state_changed":
    case "thinking_tokens":
      break;
  }

  return [];
}

/** Handle stream events (text deltas, tool use) */
function handleStreamEvent(agentId: string, message: SDKMessage & { type: "stream_event" }): AgentStreamEvent[] {
  switch (message.event.type) {
    case "content_block_delta": {
      if (message.event.delta?.type === "text_delta" && message.event.delta.text) {
        return [
          {
            agentId,
            type: AGENT_STREAM_EVENT_TYPE.CONTENT,
            sessionId: message.session_id,
            content: message.event.delta.text,
          },
        ];
      }

      break;
    }

    case "content_block_start":
    case "content_block_stop":
    case "message_start":
    case "message_stop":
    case "message_delta":
      break;
  }

  return [];
}

/**
 * Handle complete assistant message
 */
function handleAssistantMessage(agentId: string, message: SDKMessage & { type: "assistant" }): AgentStreamEvent[] {
  if (message.parent_tool_use_id) {
    return [];
  }

  const usage = message.message.usage;
  const cacheReadInputTokens = usage.cache_read_input_tokens ?? 0;
  const cacheCreationInputTokens = usage.cache_creation_input_tokens ?? 0;
  const totalInputTokens = usage.input_tokens + cacheReadInputTokens + cacheCreationInputTokens;
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  log.info(
    { agentId, type: message.type, sessionId: message.session_id, totalInputTokens, inputTokens, outputTokens },
    "handleAssistantMessage"
  );
  const sessionId = message.session_id;
  const messageId = message.uuid;
  const sessionMessage = {
    type: "assistant",
    uuid: messageId,
    session_id: sessionId,
    message: message.message,
    parent_tool_use_id: null,
  };

  return [
    {
      agentId,
      type: AGENT_STREAM_EVENT_TYPE.MESSAGE_DONE,
      sessionId,
      messageId,
      message: sessionMessage,
    },
    {
      agentId,
      type: AGENT_STREAM_EVENT_TYPE.USAGE,
      sessionId,
      totalInputTokens,
      inputTokens,
      outputTokens,
    },
  ];
}

/** Handle tool progress - surface tool execution status */
function handleToolProgress(agentId: string, message: SDKMessage & { type: "tool_progress" }): AgentStreamEvent[] {
  return [
    {
      agentId,
      type: AGENT_STREAM_EVENT_TYPE.TOOL_USE_PROGRESS,
      sessionId: message.session_id,
      toolName: message.tool_name,
      elapsedTimeSeconds: message.elapsed_time_seconds,
    },
  ];
}

/** Handle result messages */
function handleResultMessage(agentId: string, message: SDKMessage & { type: "result" }): AgentStreamEvent[] {
  // Extract context window info
  let contextUsed: number | undefined;
  let contextTotal: number | undefined;

  if (message.modelUsage) {
    const modelEntries = Object.values(message.modelUsage);
    if (modelEntries.length > 0) {
      const modelInfo = modelEntries[0];
      contextTotal = modelInfo.contextWindow;
      contextUsed =
        modelInfo.inputTokens +
        modelInfo.outputTokens +
        modelInfo.cacheReadInputTokens +
        modelInfo.cacheCreationInputTokens;
    }
  }

  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  const totalCostUsd = message.total_cost_usd;
  log.info(
    {
      agentId,
      type: message.type,
      sessionId: message.session_id,
      inputTokens,
      outputTokens,
      contextUsed,
      contextTotal,
      totalCostUsd,
    },
    "handleResultMessage"
  );

  const usage: AgentStreamUsage = {
    inputTokens,
    outputTokens,
    totalCostUsd,
    contextTotal,
    contextUsed,
  };

  return [
    {
      agentId,
      type: AGENT_STREAM_EVENT_TYPE.DONE,
      sessionId: message.session_id,
      isSuccess: !message.is_error,
      doneType: message.subtype,
      durationMs: message.duration_ms,
      usage,
    },
  ];
}
