import { OpenAI, APIError, APIUserAbortError } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type {
  ContentGenerationTextResponse,
  ChatCompletionStreamChunk,
  ChatMessage,
  ChatMessageDelta,
  ProviderTextGenerationOptions,
  TextGenerationProviderInterface,
  TokenTimingStats,
  TokenUsage,
  ToolUseInfo,
} from "../content-generation.types.js";
import { CONTENT_MODALITY, MessageRoles } from "../content-generation.types.js";
import { logger } from "../../../utils/logger.js";
import { isString } from "es-toolkit";
import { AppError } from "../../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../../core/error/app-error.types.js";
import { RequestError } from "../../../core/error/request-error.js";

interface LlamaTimingStats {
  prompt_n: number;
  prompt_ms: number;
  prompt_per_token_ms: number;
  prompt_per_second: number;
  predicted_n: number;
  predicted_ms: number;
  predicted_per_token_ms: number;
  predicted_per_second: number;
}

export interface OpenAIProviderConfig {
  baseUrl?: string;
  apiKey: string;
}

export class OpenAIProvider implements TextGenerationProviderInterface {
  public readonly name = "OpenAI";

  private readonly client: OpenAI;
  private readonly logger = logger.child({ context: "openai-provider" });

  constructor(config: OpenAIProviderConfig) {
    this.client = new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
    });
  }

  public async *streamChatCompletion(
    model: string,
    messages: ChatMessage[],
    options?: ProviderTextGenerationOptions
  ): AsyncGenerator<ChatCompletionStreamChunk, void, unknown> {
    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      ...this.buildBaseParams(model, messages, options),
      stream: true,
      stream_options: { include_usage: true },
    };

    try {
      const stream = await this.client.chat.completions.create(params, {
        signal: options?.abortSignal,
      });

      for await (const chunk of stream) {
        let timings: TokenTimingStats | undefined;

        const chunkRaw = chunk as unknown as Record<string, unknown>;
        if (chunkRaw.timings && typeof chunkRaw.timings === "object") {
          const llamaTimings = chunkRaw.timings as LlamaTimingStats;
          timings = {
            promptTokens: llamaTimings.prompt_n,
            promptMs: llamaTimings.prompt_ms,
            promptPerTokenPerMs: llamaTimings.prompt_per_token_ms,
            promptPerSecond: llamaTimings.prompt_per_second,
            predictedTokens: llamaTimings.predicted_n,
            predictedMs: llamaTimings.predicted_ms,
            predictedPerTokenPerMs: llamaTimings.predicted_per_token_ms,
            predictedPerSecond: llamaTimings.predicted_per_second,
          };
        }

        const choice = chunk.choices[0];
        const delta = choice?.delta;
        const deltaRaw = delta as unknown as Record<string, unknown>;

        const usage = chunk.usage
          ? {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            }
          : undefined;

        const message: ChatMessageDelta = {
          role: delta?.role,
          content: delta?.content ?? undefined,
          reasoningContent: isString(deltaRaw?.reasoning_content) ? deltaRaw.reasoning_content : undefined,
          toolCalls: delta?.tool_calls?.map((tc) => ({
            index: tc.index,
            id: tc.id || "",
            name: tc.function?.name || "",
            arguments: tc.function?.arguments,
          })),
          thoughtSignature: isString(deltaRaw?.thought_signature) ? deltaRaw.thought_signature : undefined,
          tokenUsage: usage,
        };

        yield {
          message,
          done: choice?.finish_reason !== null && choice?.finish_reason !== undefined,
          finishReason: choice?.finish_reason || undefined,
          usage,
          timings,
        };
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  public async chatCompletion(
    model: string,
    messages: ChatMessage[],
    options?: ProviderTextGenerationOptions
  ): Promise<ContentGenerationTextResponse> {
    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      ...this.buildBaseParams(model, messages, options),
      stream: false,
    };

    try {
      const response = await this.client.chat.completions.create(params, {
        signal: options?.abortSignal,
      });

      const choice = response.choices[0];
      const responseMessage = choice?.message;
      const messageRaw = responseMessage as unknown as Record<string, unknown>;

      const toolCalls: ToolUseInfo[] =
        responseMessage?.tool_calls?.map((toolCall, index) => ({
          index,
          id: toolCall.id,
          name: toolCall.type === "function" ? toolCall.function.name : "",
          arguments: toolCall.type === "function" ? toolCall.function.arguments : undefined,
        })) ?? [];

      const usage: TokenUsage | undefined = response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined;

      const message: ChatMessage = {
        role: MessageRoles.assistant,
        content: responseMessage?.content ?? "",
        reasoningContent: isString(messageRaw?.reasoning_content) ? messageRaw.reasoning_content : undefined,
        thoughtSignature: isString(messageRaw?.thought_signature) ? messageRaw.thought_signature : undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        tokenUsage: usage,
        timestamp: Date.now(),
      };

      return {
        model,
        modality: CONTENT_MODALITY.TEXT,
        message,
        finishReason: choice?.finish_reason ?? "stop",
        usage,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  private buildBaseParams(
    model: string,
    messages: ChatMessage[],
    options?: ProviderTextGenerationOptions
  ): Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, "stream"> {
    const reasoning_effort = options?.reasoningEffort;
    const tools: OpenAI.ChatCompletionTool[] | undefined = options?.toolDefs?.map((def) => ({
      type: "function" as const,
      function: {
        name: def.name,
        description: def.description,
        parameters: def.parameters as Record<string, unknown>,
      },
    }));

    return {
      ...options?.extraParams,
      model,
      messages: this.convertMessages(messages),
      ...(reasoning_effort !== undefined && { reasoning_effort }),
      ...(options?.useJsonSchema && {
        response_format: { type: "json_schema" as const, json_schema: options.useJsonSchema },
      }),
      ...(options?.temperature !== undefined && { temperature: options.temperature }),
      ...(options?.maxOutputTokens !== undefined && { max_completion_tokens: options.maxOutputTokens }),
      ...(tools && tools.length > 0 && { tools }),
    };
  }

  private handleError(error: unknown): never {
    // Re-throw abort errors as-is so callers can detect cancellation
    if (error instanceof APIUserAbortError || (error instanceof DOMException && error.name === "AbortError")) {
      throw error;
    }

    if (error instanceof APIError && typeof error.status === "number") {
      throw new RequestError(error.message, error.status, error.code ?? undefined);
    }

    if (error instanceof Error) {
      throw new AppError(error.message, APP_ERROR_CODES.TEXT_GEN_PROVIDER_ERROR);
    }

    throw new AppError("Text generation failed", APP_ERROR_CODES.UNKNOWN);
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
          assistantMsg.tool_calls = message.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: tc.arguments || "{}",
            },
          }));
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

      case MessageRoles.developer:
      default:
        return undefined;
    }
  }
}
