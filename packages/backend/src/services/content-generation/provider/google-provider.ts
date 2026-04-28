import { GoogleGenAI, ApiError, Modality } from "@google/genai";
import type { Content, FunctionDeclaration, GenerateContentResponseUsageMetadata, Part, Tool } from "@google/genai";
import {
  CONTENT_MODALITY,
  MessageRoles,
  type AudioGenerationProviderInterface,
  type AudioMessage,
  type ContentGenerationAudioResponse,
  type ContentGenerationTextResponse,
  type ChatCompletionStreamChunk,
  type ChatMessage,
  type ChatMessageDelta,
  type ProviderAudioGenerationOptions,
  type ProviderTextGenerationOptions,
  type TextGenerationProviderInterface,
  type ToolFunctionDefinition,
  type ToolUseInfo,
  type TokenUsage,
  type ReasoningEffort,
  REASONING_EFFORT,
} from "../content-generation.types.js";
import { logger } from "../../../utils/logger.js";
import { AppError } from "../../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../../core/error/app-error.types.js";
import { RequestError } from "../../../core/error/request-error.js";
import { generateRandomString } from "../../../utils/id-utils.js";
import { isPcmMime, parsePcmFormat } from "../audio-format.js";

const TEXT_BATCH_SIZE = 4;
const TEXT_BATCH_DELAY_MS = 10;

const THINKING_BUDGET_LOW = 1024;
const THINKING_BUDGET_MEDIUM = 8192;
const THINKING_BUDGET_HIGH = 24576;

const BITS_PER_BYTE = 8;
const MS_PER_SECOND = 1000;
const DEFAULT_VOICE = "Sulafat";

const DEFAULT_TTS_INSTRUCTION = [
  "Read the following text in a neutral, natural tone with steady pacing and confident articulation:",
].join(" ");

export class GoogleAIProvider implements TextGenerationProviderInterface, AudioGenerationProviderInterface {
  public readonly name = "Google";

  private readonly client: GoogleGenAI;
  private readonly logger = logger.child({ context: "google-provider" });

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  public async *streamChatCompletion(
    model: string,
    messages: ChatMessage[],
    options?: ProviderTextGenerationOptions
  ): AsyncGenerator<ChatCompletionStreamChunk, void, unknown> {
    const { contents, config } = this.buildRequest(messages, options);

    try {
      const responseStream = await this.client.models.generateContentStream({ model, contents, config });

      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;
      let toolCallIndex = 0;
      let finishReason: string | undefined;

      for await (const chunk of responseStream) {
        const candidate = chunk.candidates?.[0];
        const parts = candidate?.content?.parts ?? [];

        for (const part of parts) {
          const delta = this.toMessageDelta(part, toolCallIndex);
          if (!delta) {
            continue;
          }

          if (delta.content) {
            yield* this.batchTextChunks(delta.content);
          } else {
            yield { message: delta, done: false };
          }

          if (delta.toolCalls) {
            toolCallIndex += delta.toolCalls.length;
          }
        }

        if (candidate?.finishReason) {
          finishReason = candidate.finishReason;
        }

        if (chunk.usageMetadata) {
          promptTokens = chunk.usageMetadata.promptTokenCount ?? promptTokens;
          completionTokens = chunk.usageMetadata.candidatesTokenCount ?? completionTokens;
          totalTokens = chunk.usageMetadata.totalTokenCount ?? promptTokens + completionTokens;
        }
      }

      const usage = {
        promptTokens,
        completionTokens,
        totalTokens: totalTokens || promptTokens + completionTokens,
      };

      yield {
        message: { tokenUsage: usage },
        done: true,
        finishReason,
        usage,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  public async chatCompletion(
    model: string,
    messages: ChatMessage[],
    options?: ProviderTextGenerationOptions
  ): Promise<ContentGenerationTextResponse> {
    const { contents, config } = this.buildRequest(messages, options);

    try {
      const response = await this.client.models.generateContent({ model, contents, config });

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      let textContent = "";
      let reasoningContent: string | undefined;
      let thoughtSignature: string | undefined;
      const toolCalls: ToolUseInfo[] = [];

      for (const part of parts) {
        if (part.thought && part.text) {
          reasoningContent = (reasoningContent ?? "") + part.text;
        } else if (part.functionCall) {
          toolCalls.push({
            index: toolCalls.length,
            id: part.functionCall.id ?? `call_${generateRandomString(10)}`,
            name: part.functionCall.name ?? "",
            arguments: part.functionCall.args ? JSON.stringify(part.functionCall.args) : undefined,
          });
        } else if (part.text) {
          textContent += part.text;
        }

        if (part.thoughtSignature) {
          thoughtSignature = part.thoughtSignature;
        }
      }

      const usage = this.toTokenUsage(response.usageMetadata);

      const message: ChatMessage = {
        role: MessageRoles.assistant,
        content: textContent,
        reasoningContent,
        thoughtSignature,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        tokenUsage: usage,
        timestamp: Date.now(),
      };

      return {
        model,
        modality: CONTENT_MODALITY.TEXT,
        message,
        finishReason: candidate?.finishReason ?? "STOP",
        usage,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  public async synthesizeAudio(
    model: string,
    text: string,
    options?: ProviderAudioGenerationOptions
  ): Promise<ContentGenerationAudioResponse> {
    const instruction = options?.stylePrompt ?? DEFAULT_TTS_INSTRUCTION;
    const promptText = `${instruction}\n${text}`;
    const voiceName = options?.voice ?? DEFAULT_VOICE;
    const speechConfig = {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName },
      },
    };

    try {
      const response = await this.client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: promptText }] }],
        config: {
          abortSignal: options?.abortSignal,
          responseModalities: [Modality.AUDIO],
          ...(speechConfig && { speechConfig }),
        },
      });

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      let audioData: Buffer | undefined;
      let mimeType: string | undefined;
      for (const part of parts) {
        if (part.inlineData?.data) {
          audioData = Buffer.from(part.inlineData.data, "base64");
          mimeType = part.inlineData.mimeType ?? undefined;
          break;
        }
      }

      if (!audioData) {
        throw new AppError("Google audio generation returned no audio data", APP_ERROR_CODES.AUDIO_GEN_NO_DATA);
      }

      const pcmFormat = isPcmMime(mimeType) ? parsePcmFormat(mimeType) : undefined;
      const sampleRate = pcmFormat?.sampleRate;
      const durationMs = pcmFormat
        ? Math.round(
            (audioData.byteLength /
              (pcmFormat.sampleRate * pcmFormat.channels * (pcmFormat.bitDepth / BITS_PER_BYTE))) *
              MS_PER_SECOND
          )
        : undefined;

      const usage = this.toTokenUsage(response.usageMetadata);

      const message: AudioMessage = {
        role: MessageRoles.assistant,
        data: audioData,
        mimeType,
        sampleRate,
        durationMs,
        transcript: text,
        voice: voiceName,
        tokenUsage: usage,
        timestamp: Date.now(),
      };

      return {
        model,
        modality: CONTENT_MODALITY.AUDIO,
        message,
        finishReason: candidate?.finishReason ?? undefined,
        usage,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  private toTokenUsage(usageMetadata: GenerateContentResponseUsageMetadata | undefined): TokenUsage | undefined {
    if (!usageMetadata) {
      return undefined;
    }

    const promptTokens = usageMetadata.promptTokenCount ?? 0;
    const completionTokens = usageMetadata.candidatesTokenCount ?? 0;

    return {
      promptTokens,
      completionTokens,
      totalTokens: usageMetadata.totalTokenCount ?? promptTokens + completionTokens,
    };
  }

  private buildRequest(messages: ChatMessage[], options?: ProviderTextGenerationOptions) {
    const { systemInstruction, contents } = this.toGoogleContents(messages);
    const tools = this.toGoogleTools(options?.toolDefs);
    const thinkingConfig = this.toThinkingConfig(options?.reasoningEffort);

    return {
      contents,
      config: {
        abortSignal: options?.abortSignal,
        systemInstruction,
        ...(options?.temperature !== undefined && { temperature: options.temperature }),
        ...(options?.maxOutputTokens !== undefined && { maxOutputTokens: options.maxOutputTokens }),
        ...(tools && { tools }),
        ...(thinkingConfig && { thinkingConfig }),
        ...(options?.useJsonSchema
          ? {
              responseMimeType: "application/json",
              responseJsonSchema: options.useJsonSchema.schema,
            }
          : {}),
      },
    };
  }

  private toMessageDelta(part: Part, toolCallIndex: number): ChatMessageDelta | undefined {
    const delta: ChatMessageDelta = {};
    let hasValue = false;

    if (part.thought && part.text) {
      delta.reasoningContent = part.text;
      hasValue = true;
    } else if (part.functionCall) {
      delta.toolCalls = [
        {
          index: toolCallIndex,
          id: part.functionCall.id ?? `call_${generateRandomString(10)}`,
          name: part.functionCall.name ?? "",
          arguments: part.functionCall.args ? JSON.stringify(part.functionCall.args) : undefined,
        },
      ];
      hasValue = true;
    } else if (part.text) {
      delta.content = part.text;
      hasValue = true;
    }

    if (part.thoughtSignature) {
      delta.thoughtSignature = part.thoughtSignature;
      hasValue = true;
    }

    return hasValue ? delta : undefined;
  }

  private toGoogleContents(messages: ChatMessage[]): { systemInstruction?: string; contents: Content[] } {
    const contents: Content[] = [];
    let systemInstruction: string | undefined;

    for (const message of messages) {
      if (message.role === MessageRoles.system || message.role === MessageRoles.developer) {
        if (message.content) {
          systemInstruction = systemInstruction ? `${systemInstruction}\n\n${message.content}` : message.content;
        }

        continue;
      }

      if (message.role === MessageRoles.user) {
        contents.push({
          role: "user",
          parts: [{ text: message.content ?? "" }],
        });

        continue;
      }

      if (message.role === MessageRoles.assistant) {
        const parts: Part[] = [];

        if (message.content) {
          parts.push({ text: message.content, thoughtSignature: message.thoughtSignature });
        }

        if (message.toolCalls) {
          for (const toolCall of message.toolCalls) {
            parts.push({
              functionCall: {
                id: toolCall.id,
                name: toolCall.name,
                args: toolCall.arguments ? this.parseArguments(toolCall.arguments) : {},
              },
              thoughtSignature: message.thoughtSignature,
            });
          }
        }

        if (parts.length > 0) {
          contents.push({ role: "model", parts });
        }

        continue;
      }

      if (message.role === MessageRoles.tool) {
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                id: message.toolCallId,
                name: message.toolCallName ?? "",
                response: { output: message.content ?? "" },
              },
            },
          ],
        });
      }
    }

    return { systemInstruction, contents };
  }

  private parseArguments(raw: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to parse tool call arguments"
      );
    }

    return {};
  }

  private toGoogleTools(toolDefs?: ToolFunctionDefinition[]): Tool[] | undefined {
    if (!toolDefs || toolDefs.length === 0) {
      return undefined;
    }

    const functionDeclarations: FunctionDeclaration[] = toolDefs.map((def) => ({
      name: def.name,
      description: def.description,
      parametersJsonSchema: def.parameters,
    }));

    return [{ functionDeclarations }];
  }

  private toThinkingConfig(reasoningEffort?: ReasoningEffort) {
    if (!reasoningEffort) {
      return undefined;
    }

    const thinkingBudget =
      reasoningEffort === REASONING_EFFORT.LOW
        ? THINKING_BUDGET_LOW
        : reasoningEffort === REASONING_EFFORT.HIGH
          ? THINKING_BUDGET_HIGH
          : THINKING_BUDGET_MEDIUM;

    return { thinkingBudget, includeThoughts: true };
  }

  private async *batchTextChunks(text: string): AsyncGenerator<ChatCompletionStreamChunk, void, unknown> {
    for (let index = 0; index < text.length; index += TEXT_BATCH_SIZE) {
      const batch = text.slice(index, index + TEXT_BATCH_SIZE);
      yield { message: { content: batch }, done: false };
      if (index + TEXT_BATCH_SIZE < text.length) {
        await new Promise((resolve) => setTimeout(resolve, TEXT_BATCH_DELAY_MS));
      }
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    if (error instanceof ApiError) {
      throw new RequestError(error.message, error.status);
    }

    if (error instanceof Error) {
      throw new AppError(error.message, APP_ERROR_CODES.TEXT_GEN_PROVIDER_ERROR);
    }

    throw new AppError("Google provider request failed", APP_ERROR_CODES.UNKNOWN);
  }
}
