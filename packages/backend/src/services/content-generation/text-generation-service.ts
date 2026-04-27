import { container } from "../../container.js";
import { generateRandomString } from "../../utils/id-utils.js";
import { logger } from "../../utils/logger.js";
import { createModelMessageFromTemplate } from "../../utils/message-template.js";
import {
  MessageRoles,
  StreamEventTypes,
  type ChatMessage,
  type ContentGenerationTextResponse,
  type StreamEvent,
  type TextGenerationOptions,
  type TokenTimingStats,
  type TokenUsage,
  type ToolUseInfo,
} from "./content-generation.types.js";

export async function textGeneration(
  model: string,
  messages: ChatMessage[],
  options?: TextGenerationOptions
): Promise<ContentGenerationTextResponse> {
  const provider = options?.provider ?? container.textGenProvider;
  const activeMessages = options?.systemPrompt
    ? [createModelMessageFromTemplate(options.systemPrompt, options.customPromptContext)].concat(
        messages.filter((message) => message.role !== MessageRoles.system)
      )
    : messages;

  return provider.chatCompletion(model, activeMessages, options);
}

export async function* streamTextGeneration(
  model: string,
  messages: ChatMessage[],
  options?: TextGenerationOptions
): AsyncGenerator<StreamEvent, void, unknown> {
  const provider = options?.provider ?? container.textGenProvider;
  const activeMessages = options?.systemPrompt
    ? [createModelMessageFromTemplate(options.systemPrompt, options.customPromptContext)].concat(
        messages.filter((message) => message.role !== MessageRoles.system)
      )
    : messages;

  try {
    const streamIterable = provider.streamChatCompletion(model, activeMessages, options);

    let accumulatedContent = "";
    let accumulatedReasoningContent = "";
    const toolCallMap = new Map<number, ToolUseInfo>();
    let lastUsage: TokenUsage | undefined = undefined;
    let lastTimings: TokenTimingStats | undefined = undefined;
    let lastThoughtSignature: string | undefined = undefined;

    for await (const chunk of streamIterable) {
      if (chunk.message.reasoningContent) {
        accumulatedReasoningContent += chunk.message.reasoningContent;
        yield {
          type: StreamEventTypes.thinking,
          content: "",
          reasoningContent: chunk.message.reasoningContent,
        };
      }

      if (chunk.message.content) {
        accumulatedContent += chunk.message.content;
        yield {
          type: StreamEventTypes.content,
          content: chunk.message.content,
        };
      }

      if (chunk.message.toolCalls) {
        for (const toolCallDelta of chunk.message.toolCalls) {
          const index = toolCallDelta.index;
          if (!toolCallMap.has(index)) {
            toolCallMap.set(index, {
              index,
              id: toolCallDelta.id || generateRandomString(10),
              name: toolCallDelta.name ?? "",
              arguments: toolCallDelta.arguments ?? "",
            });
          } else {
            const existingToolCall = toolCallMap.get(index);
            if (existingToolCall) {
              if (toolCallDelta.id) {
                existingToolCall.id = toolCallDelta.id;
              }

              if (toolCallDelta.name) {
                existingToolCall.name += toolCallDelta.name;
              }

              if (toolCallDelta.arguments) {
                existingToolCall.arguments += toolCallDelta.arguments;
              }
            }
          }
        }
      }

      if (chunk.message.thoughtSignature) {
        lastThoughtSignature = chunk.message.thoughtSignature;
      }

      // Capture final usage and timings
      if (chunk.usage) {
        lastUsage = chunk.usage;
      }

      if (chunk.timings) {
        lastTimings = chunk.timings;
      }
    }

    const hasToolUse = toolCallMap.size > 0;
    yield {
      type: hasToolUse ? StreamEventTypes.tooluse : StreamEventTypes.messagedone,
      content: accumulatedContent,
      reasoningContent: accumulatedReasoningContent || undefined,
      usage: lastUsage,
      timings: lastTimings,
      toolCalls:
        toolCallMap.size > 0
          ? [...toolCallMap.entries()]
              .sort(([indexA], [indexB]) => indexA - indexB)
              .map(([_index, toolCall]) => toolCall)
          : undefined,
      thoughtSignature: lastThoughtSignature,
    };

    yield {
      type: StreamEventTypes.done,
      content: "",
    };
  } catch (error) {
    // Abort errors are expected - consumer cancelled intentionally
    if (error instanceof Error && error.name === "AbortError") {
      return;
    }

    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        model,
      },
      "Stream generation failed"
    );

    yield {
      type: StreamEventTypes.error,
      content: error instanceof Error ? error.message : "Unknown stream error",
    };
  }
}
