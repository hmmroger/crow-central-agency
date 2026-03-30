import type { SDKMessage, Query } from "@anthropic-ai/claude-agent-sdk";
import { AGENT_STATUS } from "@crow-central-agency/shared";
import { parseToolActivity } from "./tool-activity-parser.js";
import { logger } from "../utils/logger.js";
import { AGENT_STREAM_EVENT_TYPE, type AgentStreamEvent, type AgentStreamUsage } from "./agent-runner.types.js";

const log = logger.child({ context: "stream-processor" });

export async function* processStream(
  agentId: string,
  queryStream: Query,
  internalMcpPrefixes: string[]
): AsyncGenerator<AgentStreamEvent> {
  for await (const message of queryStream) {
    const agentStreamEvent = handleMessage(agentId, message, internalMcpPrefixes);
    if (agentStreamEvent) {
      yield agentStreamEvent;
    }
  }
}

function handleMessage(
  agentId: string,
  message: SDKMessage,
  internalMcpPrefixes: string[]
): AgentStreamEvent | undefined {
  switch (message.type) {
    case "system":
      return handleSystemMessage(agentId, message, internalMcpPrefixes);

    case "stream_event":
      return handleStreamEvent(message);

    case "assistant":
      return handleAssistantMessage(agentId, message);

    case "result":
      return handleResultMessage(agentId, message);

    case "tool_progress":
      return handleToolProgress(agentId, message);

    case "rate_limit_event": {
      return {
        type: AGENT_STREAM_EVENT_TYPE.RATE_LIMIT_INFO,
        sessionId: message.session_id,
        rateLimitStatus: message.rate_limit_info.status,
        rateLimitType: message.rate_limit_info.rateLimitType,
      };
    }

    case "user":
    case "auth_status":
    case "tool_use_summary":
    case "prompt_suggestion":
    default:
      log.debug({ agentId, type: message.type, sessionId: message.session_id }, "Unhandled SDK message received");
      return undefined;
  }
}

/** Handle system messages (init, status, compact_boundary) */
function handleSystemMessage(
  agentId: string,
  message: SDKMessage & { type: "system" },
  internalMcpPrefixes: string[]
): AgentStreamEvent | undefined {
  if (!message.subtype) {
    return undefined;
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

      return {
        type: AGENT_STREAM_EVENT_TYPE.INIT,
        sessionId: message.session_id,
        discoveredTools,
      };
    }

    case "status": {
      if (message.status === "compacting") {
        return {
          type: AGENT_STREAM_EVENT_TYPE.STATUS,
          sessionId: message.session_id,
          status: AGENT_STATUS.COMPACTING,
        };
      }

      break;
    }

    case "compact_boundary": {
      log.info({ agentId }, "Compact boundary reached");
      break;
    }

    case "local_command_output":
    case "hook_started":
    case "hook_progress":
    case "hook_response":
    case "task_notification":
    case "task_started":
    case "task_progress":
    case "files_persisted":
    case "elicitation_complete":
      break;
  }

  return undefined;
}

/** Handle stream events (text deltas, tool use) */
function handleStreamEvent(message: SDKMessage & { type: "stream_event" }): AgentStreamEvent | undefined {
  switch (message.event.type) {
    case "content_block_delta": {
      if (message.event.delta?.type === "text_delta" && message.event.delta.text) {
        return {
          type: AGENT_STREAM_EVENT_TYPE.CONTENT,
          sessionId: message.session_id,
          content: message.event.delta.text,
        };
      }

      break;
    }

    case "content_block_start": {
      if (message.event.content_block?.type === "tool_use" && message.event.content_block.name) {
        const toolName = message.event.content_block.name;
        const description = parseToolActivity(toolName, message.event.content_block.input);
        return {
          type: AGENT_STREAM_EVENT_TYPE.TOOL_USE,
          sessionId: message.session_id,
          toolName,
          description,
          input: message.event.content_block.input,
        };
      }

      break;
    }

    case "content_block_stop":
    case "message_start":
    case "message_stop":
    case "message_delta":
      break;
  }

  return undefined;
}

/**
 * Handle complete assistant message
 */
function handleAssistantMessage(agentId: string, message: SDKMessage & { type: "assistant" }): AgentStreamEvent {
  log.debug({ agentId, type: message.type, sessionId: message.session_id }, "handleAssistantMessage");
  return {
    type: AGENT_STREAM_EVENT_TYPE.MESSAGE_DONE,
    sessionId: message.session_id,
    messageId: message.uuid,
    message: message.message,
  };
}

/** Handle tool progress — surface tool execution status */
function handleToolProgress(agentId: string, message: SDKMessage & { type: "tool_progress" }): AgentStreamEvent {
  log.debug({ agentId, type: message.type, sessionId: message.session_id }, "handleToolProgress");
  return {
    type: AGENT_STREAM_EVENT_TYPE.TOOL_USE_PROGRESS,
    sessionId: message.session_id,
    toolName: message.tool_name,
    elapsedTimeSeconds: message.elapsed_time_seconds,
  };
}

/** Handle result messages */
function handleResultMessage(agentId: string, message: SDKMessage & { type: "result" }): AgentStreamEvent | undefined {
  log.debug({ agentId, type: message.type, sessionId: message.session_id }, "handleResultMessage");
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

  const usage: AgentStreamUsage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    totalCostUsd: message.total_cost_usd,
    contextTotal,
    contextUsed,
  };

  return {
    type: AGENT_STREAM_EVENT_TYPE.DONE,
    sessionId: message.session_id,
    isSuccess: !message.is_error,
    doneType: message.subtype,
    durationMs: message.duration_ms,
    usage,
  };
}
