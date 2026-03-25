import type { SDKMessage, Query, SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ServerMessage } from "@crow-central-agency/shared";
import { parseToolActivity } from "./tool-activity-parser.js";
import type { ProcessedStreamEvent, StreamResultInfo } from "./stream-processor.types.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "stream-processor" });

/**
 * Process an SDK Query stream as an async generator.
 * Yields ProcessedStreamEvent for each SDK message that produces output.
 * The stream processor is a pure data transformer — it has no side effects.
 * The orchestrator decides what to do with each yielded event.
 *
 * Text deltas are pushed directly as agent_text WS messages — no server-side
 * batching. The frontend accumulates them in streamingText for real-time display.
 *
 * @param agentId - The agent this stream belongs to
 * @param queryStream - The SDK Query async generator
 */
export async function* processStream(agentId: string, queryStream: Query): AsyncGenerator<ProcessedStreamEvent> {
  const pendingWsMessages: ServerMessage[] = [];

  try {
    for await (const message of queryStream) {
      const processedEvent = handleMessage(agentId, message);
      if (processedEvent) {
        yield processedEvent;
      }
    }
  } catch (error) {
    log.error({ agentId, error }, "Stream processing error");
    yield {
      wsMessages: pendingWsMessages.splice(0),
      meta: {
        result: {
          success: false,
          subtype: "error_during_execution",
          totalCostUsd: 0,
          durationMs: 0,
          inputTokens: 0,
          outputTokens: 0,
        },
      },
    };
  }
}

/** Process a single SDK message — returns extracted data, pushes WS messages to pending array */
function handleMessage(agentId: string, message: SDKMessage): ProcessedStreamEvent | undefined {
  switch (message.type) {
    case "system":
      return handleSystemMessage(agentId, message);

    case "stream_event":
      return handleStreamEvent(agentId, message);

    case "assistant":
      return handleAssistantMessage(message);

    case "result":
      return handleResultMessage(agentId, message);

    case "tool_progress":
      return handleToolProgress(agentId, message);

    case "rate_limit_event": {
      if (message.rate_limit_info.status === "rejected") {
        log.warn({ agentId, rateLimit: message.rate_limit_info }, "Rate limited.");
      } else {
        log.info({ agentId, rateLimit: message.rate_limit_info }, "Rate limit info changed.");
      }

      return undefined;
    }

    default:
      log.debug({ type: message.type, sessionId: message.session_id }, "Unhandled SDK message received");
      return undefined;
  }
}

/** Handle system messages (init, status, compact_boundary) */
function handleSystemMessage(
  agentId: string,
  message: SDKMessage & { type: "system" }
): ProcessedStreamEvent | undefined {
  if (!message.subtype) {
    return undefined;
  }

  log.debug({ type: message.type, subtype: message.subtype, sessionId: message.session_id }, "handleSystemMessage");

  switch (message.subtype) {
    case "init": {
      log.info({ agentId, sessionId: message.session_id, tools: message.tools.length }, "Session initialized");
      return {
        wsMessages: [],
        meta: {
          sessionId: message.session_id,
          discoveredTools: message.tools,
        },
      };
    }

    case "status": {
      if (message.status === "compacting") {
        return {
          wsMessages: [{ type: "agent_status", agentId, status: "compacting" }],
          meta: { status: "compacting" },
        };
      }

      break;
    }

    case "compact_boundary": {
      log.info({ agentId }, "Compact boundary reached");
      break;
    }
  }

  return undefined;
}

/** Handle stream events (text deltas, tool use) */
function handleStreamEvent(
  agentId: string,
  message: SDKMessage & { type: "stream_event" }
): ProcessedStreamEvent | undefined {
  const event = (
    message as {
      event: {
        type: string;
        delta?: { type?: string; text?: string };
        content_block?: { type?: string; name?: string; input?: unknown };
        index?: number;
      };
    }
  ).event;

  log.debug({ type: message.type, eventType: event.type, sessionId: message.session_id }, "handleStreamEvent");

  switch (event.type) {
    case "content_block_delta": {
      if (event.delta?.type === "text_delta" && event.delta.text) {
        return {
          wsMessages: [{ type: "agent_text", agentId, text: event.delta.text }],
        };
      }

      break;
    }

    case "content_block_start": {
      if (event.content_block?.type === "tool_use" && event.content_block.name) {
        const toolName = event.content_block.name;
        const toolInput = (event.content_block.input ?? {}) as Record<string, unknown>;
        const description = parseToolActivity(toolName, toolInput);
        return {
          wsMessages: [
            {
              type: "agent_activity",
              agentId,
              toolName,
              description,
            },
          ],
        };
      }

      break;
    }
  }

  return undefined;
}

/**
 * Handle complete assistant message — convert to SessionMessage for cache persistence.
 * Also extracts per-turn usage for meta.
 */
function handleAssistantMessage(message: SDKMessage & { type: "assistant" }): ProcessedStreamEvent | undefined {
  log.debug({ type: message.type, sessionId: message.session_id }, "handleAssistantMessage");

  // Convert SDKAssistantMessage → SessionMessage (nearly identical shapes)
  const sessionMessage: SessionMessage = {
    type: "assistant",
    uuid: message.uuid,
    session_id: message.session_id,
    message: message.message,
    parent_tool_use_id: null,
  };

  return { wsMessages: [], sessionMessage };
}

/** Handle tool progress — surface tool execution status */
function handleToolProgress(
  agentId: string,
  message: SDKMessage & { type: "tool_progress" }
): ProcessedStreamEvent | undefined {
  log.debug({ type: message.type, sessionId: message.session_id }, "handleToolProgress");
  return {
    wsMessages: [
      {
        type: "agent_tool_progress",
        agentId,
        toolName: message.tool_name,
        elapsedTimeSeconds: message.elapsed_time_seconds,
      },
    ],
  };
}

/** Handle result messages (success/error) */
function handleResultMessage(
  agentId: string,
  message: SDKMessage & { type: "result" }
): ProcessedStreamEvent | undefined {
  log.debug({ type: message.type, sessionId: message.session_id }, "handleResultMessage");
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

  const resultInfo: StreamResultInfo = {
    success: !message.is_error,
    subtype: message.subtype,
    totalCostUsd: message.total_cost_usd,
    durationMs: message.duration_ms,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    contextUsed,
    contextTotal,
  };

  // Emit result + usage WS messages
  const wsMessages: ServerMessage[] = [
    {
      type: "agent_result",
      agentId,
      subtype: message.subtype,
      totalCostUsd: message.total_cost_usd,
      durationMs: message.duration_ms,
    },
    {
      type: "agent_usage",
      agentId,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      totalCostUsd: message.total_cost_usd,
      contextUsed: contextUsed ?? 0,
      contextTotal: contextTotal ?? 0,
    },
  ];

  return { wsMessages, meta: { result: resultInfo } };
}
