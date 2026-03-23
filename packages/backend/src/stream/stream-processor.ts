import type { SDKMessage, Query, SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ServerMessage } from "@crow-central-agency/shared";
import { TextCoalescer } from "./text-coalescer.js";
import { parseToolActivity } from "./tool-activity-parser.js";
import type { ProcessedStreamEvent, StreamEventMeta, StreamResultInfo } from "./stream-processor.types.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "stream-processor" });

/**
 * Process an SDK Query stream as an async generator.
 * Yields ProcessedStreamEvent for each SDK message that produces output.
 * The stream processor is a pure data transformer — it has no side effects.
 * The orchestrator decides what to do with each yielded event.
 *
 * @param agentId - The agent this stream belongs to
 * @param queryStream - The SDK Query async generator
 */
export async function* processStream(agentId: string, queryStream: Query): AsyncGenerator<ProcessedStreamEvent> {
  const pendingWsMessages: ServerMessage[] = [];
  const coalescer = new TextCoalescer((text) => {
    pendingWsMessages.push({ type: "agent_text", agentId, text });
  });

  try {
    for await (const message of queryStream) {
      const partial = handleMessage(agentId, message, coalescer, pendingWsMessages);

      if (pendingWsMessages.length > 0 || partial.sessionMessage || partial.meta) {
        yield {
          wsMessages: pendingWsMessages.splice(0),
          sessionMessage: partial.sessionMessage,
          meta: partial.meta,
        };
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
          costUsd: 0,
          totalCostUsd: 0,
          durationMs: 0,
          inputTokens: 0,
          outputTokens: 0,
        },
      },
    };
  } finally {
    coalescer.flush();

    if (pendingWsMessages.length > 0) {
      yield { wsMessages: pendingWsMessages.splice(0) };
    }
  }
}

/** Partial result from processing a single SDK message */
interface MessagePartial {
  sessionMessage?: SessionMessage;
  meta?: StreamEventMeta;
}

/** Process a single SDK message — returns extracted data, pushes WS messages to pending array */
function handleMessage(
  agentId: string,
  message: SDKMessage,
  coalescer: TextCoalescer,
  pendingWsMessages: ServerMessage[]
): MessagePartial {
  switch (message.type) {
    case "system":
      return handleSystemMessage(agentId, message, coalescer, pendingWsMessages);

    case "stream_event":
      handleStreamEvent(agentId, message, coalescer, pendingWsMessages);
      return {};

    case "assistant":
      return handleAssistantMessage(message, coalescer);

    case "result":
      return handleResultMessage(agentId, message, coalescer, pendingWsMessages);

    case "tool_progress":
      return handleToolProgress(agentId, message, coalescer, pendingWsMessages);

    case "rate_limit_event": {
      coalescer.flush();
      const rateMsg = message as SDKMessage & { rate_limit_info?: unknown };
      log.warn({ agentId, rateLimit: rateMsg.rate_limit_info }, "Rate limit event");
      return {};
    }

    default:
      return {};
  }
}

/** Handle system messages (init, status, compact_boundary) */
function handleSystemMessage(
  agentId: string,
  message: SDKMessage & { type: "system" },
  coalescer: TextCoalescer,
  pendingWsMessages: ServerMessage[]
): MessagePartial {
  if (!("subtype" in message)) {
    return {};
  }

  switch (message.subtype) {
    case "init": {
      const initMsg = message as SDKMessage & { type: "system"; subtype: "init"; session_id: string; tools: string[] };
      log.info({ agentId, sessionId: initMsg.session_id, tools: initMsg.tools.length }, "Session initialized");
      return {
        meta: {
          sessionId: initMsg.session_id,
          discoveredTools: initMsg.tools,
        },
      };
    }

    case "status": {
      coalescer.flush();
      const statusMsg = message as SDKMessage & { type: "system"; subtype: "status"; status: string | null };

      if (statusMsg.status === "compacting") {
        pendingWsMessages.push({ type: "agent_status", agentId, status: "compacting" });
        return { meta: { status: "compacting" } };
      }

      return {};
    }

    case "compact_boundary": {
      coalescer.flush();
      log.info({ agentId }, "Compact boundary reached");
      return {};
    }

    default:
      return {};
  }
}

/** Handle stream events (text deltas, tool use) */
function handleStreamEvent(
  agentId: string,
  message: SDKMessage & { type: "stream_event" },
  coalescer: TextCoalescer,
  pendingWsMessages: ServerMessage[]
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
        coalescer.flush();

        const toolName = event.content_block.name;
        const toolInput = (event.content_block.input ?? {}) as Record<string, unknown>;
        const description = parseToolActivity(toolName, toolInput);

        pendingWsMessages.push({
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

/**
 * Handle complete assistant message — convert to SessionMessage for cache persistence.
 * Also extracts per-turn usage for meta.
 */
function handleAssistantMessage(message: SDKMessage & { type: "assistant" }, coalescer: TextCoalescer): MessagePartial {
  coalescer.flush();

  const assistantMsg = message as SDKMessage & {
    type: "assistant";
    uuid: string;
    session_id: string;
    message: unknown;
    parent_tool_use_id: string | null;
  };

  // Convert SDKAssistantMessage → SessionMessage (nearly identical shapes)
  const sessionMessage: SessionMessage = {
    type: "assistant",
    uuid: assistantMsg.uuid,
    session_id: assistantMsg.session_id,
    message: assistantMsg.message,
    parent_tool_use_id: null,
  };

  // Extract per-turn usage
  const usage = (assistantMsg.message as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage;
  const meta: StreamEventMeta | undefined = usage
    ? { usage: { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0 } }
    : undefined;

  return { sessionMessage, meta };
}

/** Handle tool progress — surface tool execution status */
function handleToolProgress(
  agentId: string,
  message: SDKMessage & { type: "tool_progress" },
  coalescer: TextCoalescer,
  pendingWsMessages: ServerMessage[]
): MessagePartial {
  coalescer.flush();

  const progressMsg = message as SDKMessage & {
    type: "tool_progress";
    tool_name: string;
    elapsed_time_seconds: number;
  };

  pendingWsMessages.push({
    type: "agent_tool_progress",
    agentId,
    toolName: progressMsg.tool_name,
    elapsedTimeSeconds: progressMsg.elapsed_time_seconds,
  });

  return {};
}

/** Handle result messages (success/error) */
function handleResultMessage(
  agentId: string,
  message: SDKMessage & { type: "result" },
  coalescer: TextCoalescer,
  pendingWsMessages: ServerMessage[]
): MessagePartial {
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

  // Extract context window info
  let contextUsed: number | undefined;
  let contextTotal: number | undefined;

  if (resultMsg.modelUsage) {
    const modelEntries = Object.values(resultMsg.modelUsage);

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
    success: !resultMsg.is_error,
    subtype: resultMsg.subtype,
    costUsd: resultMsg.total_cost_usd,
    totalCostUsd: resultMsg.total_cost_usd,
    durationMs: resultMsg.duration_ms,
    inputTokens: resultMsg.usage.input_tokens,
    outputTokens: resultMsg.usage.output_tokens,
    contextUsed,
    contextTotal,
  };

  // Emit result + usage WS messages
  pendingWsMessages.push({
    type: "agent_result",
    agentId,
    subtype: resultMsg.subtype,
    costUsd: resultMsg.total_cost_usd,
    totalCostUsd: resultMsg.total_cost_usd,
    durationMs: resultMsg.duration_ms,
  });

  pendingWsMessages.push({
    type: "agent_usage",
    agentId,
    inputTokens: resultMsg.usage.input_tokens,
    outputTokens: resultMsg.usage.output_tokens,
    totalCostUsd: resultMsg.total_cost_usd,
    contextUsed: contextUsed ?? 0,
    contextTotal: contextTotal ?? 0,
  });

  return { meta: { result: resultInfo } };
}
