import type { SDKMessage, Query } from "@anthropic-ai/claude-agent-sdk";
import { TextCoalescer } from "./text-coalescer.js";
import { parseToolActivity } from "./tool-activity-parser.js";
import type { StreamEmitter, StreamResult } from "./stream-processor.types.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "stream-processor" });

/**
 * Iterate a Query's async generator, mapping SDKMessage types to WS broadcast messages.
 * Handles text coalescing, tool activity extraction, usage tracking, and result capture.
 *
 * @param agentId - The agent this stream belongs to
 * @param queryStream - The SDK Query async generator
 * @param emit - Callback to broadcast WS messages to subscribers
 * @returns StreamResult with captured session info, usage, and success/error status
 */
export async function processStream(agentId: string, queryStream: Query, emit: StreamEmitter): Promise<StreamResult> {
  const result: StreamResult = { success: false };

  const coalescer = new TextCoalescer((text) => {
    emit({ type: "agent_text", agentId, text });
  });

  try {
    for await (const message of queryStream) {
      handleMessage(agentId, message, coalescer, emit, result);
    }
  } catch (error) {
    log.error({ agentId, error }, "Stream processing error");
    result.success = false;
    result.errorSubtype = "error_during_execution";
  } finally {
    // Flush any remaining buffered text
    coalescer.flush();
  }

  return result;
}

/** Process a single SDK message */
function handleMessage(
  agentId: string,
  message: SDKMessage,
  coalescer: TextCoalescer,
  emit: StreamEmitter,
  result: StreamResult
): void {
  switch (message.type) {
    case "system": {
      handleSystemMessage(agentId, message, coalescer, emit, result);
      break;
    }

    case "stream_event": {
      handleStreamEvent(agentId, message, coalescer, emit);
      break;
    }

    case "assistant": {
      // Flush text before usage update
      coalescer.flush();

      // Per-turn usage tracking
      const usage = message.message?.usage;

      if (usage) {
        result.inputTokens = (result.inputTokens ?? 0) + (usage.input_tokens ?? 0);
        result.outputTokens = (result.outputTokens ?? 0) + (usage.output_tokens ?? 0);
      }

      break;
    }

    case "result": {
      handleResultMessage(agentId, message, coalescer, emit, result);
      break;
    }

    case "tool_progress": {
      // Real-time tool progress — flush text first
      coalescer.flush();
      break;
    }

    case "rate_limit_event": {
      coalescer.flush();
      log.warn({ agentId, rateLimit: message.rate_limit_info }, "Rate limit event");
      break;
    }

    default:
      // Other message types (user, user_message_replay, etc.) — ignore
      break;
  }
}

/** Handle system messages (init, status, compact_boundary) */
function handleSystemMessage(
  agentId: string,
  message: SDKMessage & { type: "system" },
  coalescer: TextCoalescer,
  emit: StreamEmitter,
  result: StreamResult
): void {
  if (!("subtype" in message)) {
    return;
  }

  switch (message.subtype) {
    case "init": {
      const initMsg = message as SDKMessage & { type: "system"; subtype: "init"; session_id: string; tools: string[] };
      result.sessionId = initMsg.session_id;
      result.discoveredTools = initMsg.tools;
      log.info({ agentId, sessionId: initMsg.session_id, tools: initMsg.tools.length }, "Session initialized");
      break;
    }

    case "status": {
      coalescer.flush();
      const statusMsg = message as SDKMessage & { type: "system"; subtype: "status"; status: string | null };

      if (statusMsg.status === "compacting") {
        emit({ type: "agent_status", agentId, status: "compacting" });
      }

      break;
    }

    case "compact_boundary": {
      coalescer.flush();
      log.info({ agentId }, "Compact boundary reached");
      break;
    }

    default:
      break;
  }
}

/** Handle stream events (text deltas, tool use) */
function handleStreamEvent(
  agentId: string,
  message: SDKMessage & { type: "stream_event" },
  coalescer: TextCoalescer,
  emit: StreamEmitter
): void {
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

  switch (event.type) {
    case "content_block_delta": {
      if (event.delta?.type === "text_delta" && event.delta.text) {
        coalescer.append(event.delta.text);
      }

      break;
    }

    case "content_block_start": {
      if (event.content_block?.type === "tool_use" && event.content_block.name) {
        // Flush text before activity
        coalescer.flush();

        const toolName = event.content_block.name;
        const toolInput = (event.content_block.input ?? {}) as Record<string, unknown>;
        const description = parseToolActivity(toolName, toolInput);

        emit({
          type: "agent_activity",
          agentId,
          toolName,
          description,
          isSubagent: false,
        });
      }

      break;
    }

    default:
      break;
  }
}

/** Handle result messages (success/error) */
function handleResultMessage(
  agentId: string,
  message: SDKMessage & { type: "result" },
  coalescer: TextCoalescer,
  emit: StreamEmitter,
  result: StreamResult
): void {
  coalescer.flush();

  const resultMsg = message as SDKMessage & {
    type: "result";
    subtype: string;
    total_cost_usd: number;
    duration_ms: number;
    usage: { input_tokens: number; output_tokens: number };
    modelUsage?: Record<
      string,
      {
        contextWindow: number;
        inputTokens: number;
        outputTokens: number;
        cacheReadInputTokens: number;
        cacheCreationInputTokens: number;
      }
    >;
    is_error: boolean;
  };

  result.success = !resultMsg.is_error;
  result.errorSubtype = resultMsg.is_error ? resultMsg.subtype : undefined;
  result.totalCostUsd = resultMsg.total_cost_usd;
  result.durationMs = resultMsg.duration_ms;
  result.costUsd = resultMsg.total_cost_usd;
  result.inputTokens = resultMsg.usage.input_tokens;
  result.outputTokens = resultMsg.usage.output_tokens;

  // Extract context window info from modelUsage
  if (resultMsg.modelUsage) {
    const modelEntries = Object.values(resultMsg.modelUsage);

    if (modelEntries.length > 0) {
      const modelInfo = modelEntries[0];
      result.contextTotal = modelInfo.contextWindow;
      result.contextUsed =
        modelInfo.inputTokens +
        modelInfo.outputTokens +
        modelInfo.cacheReadInputTokens +
        modelInfo.cacheCreationInputTokens;
    }
  }

  // Broadcast result
  emit({
    type: "agent_result",
    agentId,
    subtype: resultMsg.subtype,
    costUsd: resultMsg.total_cost_usd,
    totalCostUsd: resultMsg.total_cost_usd,
    durationMs: resultMsg.duration_ms,
  });

  // Broadcast usage
  emit({
    type: "agent_usage",
    agentId,
    inputTokens: result.inputTokens ?? 0,
    outputTokens: result.outputTokens ?? 0,
    totalCostUsd: resultMsg.total_cost_usd,
    contextUsed: result.contextUsed ?? 0,
    contextTotal: result.contextTotal ?? 0,
  });
}
