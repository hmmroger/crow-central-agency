import { OpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type {
  ChatMessage,
  LlamaTimingStats,
  OpenAIProviderConfig,
  StreamEvent,
  TextGenerationOptions,
} from "./openai-provider.types.js";
import { MessageRoles, StreamEventTypes } from "./openai-provider.types.js";
import { logger } from "../utils/logger.js";

const DEFAULT_API_KEY = "not-needed";

export class OpenAIProvider {
  private readonly client: OpenAI;
  private readonly logger = logger.child({ context: "openai-provider" });

  constructor(config: OpenAIProviderConfig) {
    this.client = new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey ?? DEFAULT_API_KEY,
    });
  }

  public async *streamTextGeneration(
    model: string,
    messages: ChatMessage[],
    options?: TextGenerationOptions
  ): AsyncGenerator<StreamEvent> {
    try {
      const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
        ...options?.extraParams,
        model,
        messages: this.convertMessages(messages),
        stream: true,
        stream_options: { include_usage: true },
        ...(options?.temperature !== undefined && { temperature: options.temperature }),
        ...(options?.maxTokens !== undefined && { max_tokens: options.maxTokens }),
        ...(options?.tools && options.tools.length > 0 && { tools: options.tools }),
      };

      const stream = await this.client.chat.completions.create(params, {
        signal: options?.abortSignal,
      });

      let accumulatedContent = "";
      let accumulatedReasoningContent = "";
      const toolCallMap = new Map<number, OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall>();
      let usage: OpenAI.CompletionUsage | undefined;
      let timings: LlamaTimingStats | undefined;
      let thoughtSignature: string | undefined;

      for await (const chunk of stream) {
        // Usage appears in the final chunk
        if (chunk.usage) {
          usage = chunk.usage;
        }

        // llama.cpp extension: timings on chunk
        const chunkRaw = chunk as unknown as Record<string, unknown>;
        if (chunkRaw.timings && typeof chunkRaw.timings === "object") {
          timings = chunkRaw.timings as LlamaTimingStats;
        }

        // Final usage-only chunk has empty choices
        if (!chunk.choices || chunk.choices.length === 0) {
          continue;
        }

        const choice = chunk.choices[0];
        const delta = choice.delta;
        const deltaRaw = delta as unknown as Record<string, unknown>;

        // Content delta
        if (delta.content) {
          accumulatedContent += delta.content;
          yield { type: StreamEventTypes.content, content: delta.content };
        }

        // llama.cpp extension: reasoning_content in delta
        if (typeof deltaRaw.reasoning_content === "string" && deltaRaw.reasoning_content) {
          const reasoningChunk = deltaRaw.reasoning_content;
          accumulatedReasoningContent += reasoningChunk;
          yield {
            type: StreamEventTypes.thinking,
            content: "",
            reasoningContent: reasoningChunk,
          };
        }

        // llama.cpp extension: thought_signature in delta
        if (typeof deltaRaw.thought_signature === "string") {
          thoughtSignature = deltaRaw.thought_signature;
        }

        // Tool call deltas
        if (delta.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;

            if (toolCallDelta.id) {
              // New tool call
              toolCallMap.set(index, {
                id: toolCallDelta.id,
                type: "function",
                function: {
                  name: toolCallDelta.function?.name ?? "",
                  arguments: toolCallDelta.function?.arguments ?? "",
                },
              });
            } else {
              // Append arguments to existing tool call
              const existing = toolCallMap.get(index);
              if (existing && toolCallDelta.function?.arguments) {
                existing.function.arguments += toolCallDelta.function.arguments;
              }
            }

            if (toolCallDelta.function?.arguments) {
              yield {
                type: StreamEventTypes.tooluse,
                content: toolCallDelta.function.arguments,
              };
            }
          }
        }
      }

      // Emit messagedone with all accumulated data
      yield {
        type: StreamEventTypes.messagedone,
        content: accumulatedContent,
        reasoningContent: accumulatedReasoningContent || undefined,
        usage,
        timings,
        toolCalls:
          toolCallMap.size > 0
            ? [...toolCallMap.entries()]
                .sort(([indexA], [indexB]) => indexA - indexB)
                .map(([_index, toolCall]) => toolCall)
            : undefined,
        thoughtSignature,
      };

      yield { type: StreamEventTypes.done, content: "" };
    } catch (error) {
      // Abort errors are expected - consumer cancelled intentionally
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      this.logger.error(
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

  private convertMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
    const converted: ChatCompletionMessageParam[] = [];
    for (const message of messages) {
      const param = this.convertSingleMessage(message);
      if (param) {
        converted.push(param);
      }
    }

    return converted;
  }

  private convertSingleMessage(message: ChatMessage): ChatCompletionMessageParam | undefined {
    switch (message.role) {
      case MessageRoles.system:
        return { role: "system", content: message.content ?? "" };

      case MessageRoles.user:
        return { role: "user", content: message.content ?? "" };

      case MessageRoles.assistant: {
        const assistantMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
          role: "assistant",
          content: message.content ?? "",
        };
        if (message.toolCalls && message.toolCalls.length > 0) {
          assistantMsg.tool_calls = message.toolCalls;
        }

        return assistantMsg;
      }

      case MessageRoles.tool: {
        if (!message.toolCallId) {
          this.logger.warn("Skipping tool message without toolCallId");
          return undefined;
        }

        return {
          role: "tool",
          content: message.content ?? "",
          tool_call_id: message.toolCallId,
        };
      }

      case MessageRoles.function:
        // Deprecated role - skip
        this.logger.warn("Skipping deprecated function role message");
        return undefined;

      default:
        return undefined;
    }
  }
}
