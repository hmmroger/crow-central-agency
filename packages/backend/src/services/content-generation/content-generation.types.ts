import { z } from "zod";
import type { MessageTemplate } from "../../utils/message-template.types.js";

export const messageRoleSchema = z.enum(["user", "assistant", "system", "function", "tool", "developer"]);
export type MessageRole = z.infer<typeof messageRoleSchema>;
export const MessageRoles = messageRoleSchema.enum;

export const CONTENT_MODALITY = {
  AUDIO: "AUDIO",
  TEXT: "TEXT",
} as const;
export type ContentModality = (typeof CONTENT_MODALITY)[keyof typeof CONTENT_MODALITY];

export const REASONING_EFFORT = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;
export type ReasoningEffort = (typeof REASONING_EFFORT)[keyof typeof REASONING_EFFORT];

export type FunctionParameters = Record<string, unknown>;
export interface ToolFunctionDefinition {
  name: string;
  description?: string;
  parameters?: FunctionParameters;
  strict?: boolean | null;
}

export interface ToolUseInfo {
  index: number;
  id: string;
  name: string;
  arguments?: string;
}

export type ToolUseInfoDelta = Partial<ToolUseInfo>;

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TokenTimingStats {
  promptTokens: number;
  promptMs: number;
  promptPerTokenPerMs: number;
  promptPerSecond: number;
  predictedTokens: number;
  predictedMs: number;
  predictedPerTokenPerMs: number;
  predictedPerSecond: number;
}

export interface ChatMessage {
  role: MessageRole;
  content?: string;
  reasoningContent?: string;

  toolCalls?: ToolUseInfo[];
  toolCallName?: string;
  toolCallId?: string;

  thoughtSignature?: string;

  tokenUsage?: TokenUsage;

  isHidden?: boolean;
  isToolNudgePrompt?: boolean;

  timestamp: number;
}

export type ChatMessageDelta = Partial<ChatMessage>;

export interface ChatCompletionStreamChunk {
  message: ChatMessageDelta;
  done: boolean;
  finishReason?: string;
  usage?: TokenUsage;
  timings?: TokenTimingStats;
}

export const streamEventTypeSchema = z.enum([
  "content",
  "thinking",
  "tooluse",
  "toolresp",
  "messagedone",
  "done",
  "error",
]);
export type StreamEventType = z.infer<typeof streamEventTypeSchema>;
export const StreamEventTypes = streamEventTypeSchema.enum;

export interface StreamEvent {
  type: StreamEventType;
  content: string;
  reasoningContent?: string;
  usage?: TokenUsage;
  timings?: TokenTimingStats;
  toolCalls?: ToolUseInfo[];
  thoughtSignature?: string;
  isToolError?: boolean;
}

export interface ResponseJSONSchema {
  name: string;
  description?: string;
  schema?: { [key: string]: unknown };
  strict?: boolean | null;
}

export interface TextGenerationOptions {
  provider?: TextGenerationProviderInterface;
  systemPrompt?: MessageTemplate;
  temperature?: number;
  maxOutputTokens?: number;
  useJsonSchema?: ResponseJSONSchema;
  toolDefs?: ToolFunctionDefinition[];
  reasoningEffort?: ReasoningEffort;
  abortSignal?: AbortSignal;
  customPromptContext?: { [key: string]: string | undefined };
  extraParams?: Record<string, unknown>;
}

export interface AudioMessage {
  role: MessageRole;

  data?: Buffer;
  mimeType?: string;
  sampleRate?: number;
  durationMs?: number;

  transcript?: string;
  voice?: string;

  tokenUsage?: TokenUsage;

  timestamp: number;
}

export interface VoiceConfig {
  speakerName?: string;
  voice?: string;
}

export interface AudioGenerationOptions {
  provider?: AudioGenerationProviderInterface;
  stylePrompt?: string;
  mimeType?: string;
  voice?: VoiceConfig[];
  /** Max characters per provider call. When text exceeds this, the service splits on sentence boundaries and concatenates the resulting audio. */
  maxChunkChars?: number;
  abortSignal?: AbortSignal;
  extraParams?: Record<string, unknown>;
}

export type ContentGenerationResponse = ContentGenerationTextResponse | ContentGenerationAudioResponse;

export interface ContentGenerationResponseCommon {
  model: string;
  modality: ContentModality;
  finishReason?: string;
}

export interface ContentGenerationTextResponse extends ContentGenerationResponseCommon {
  modality: (typeof CONTENT_MODALITY)["TEXT"];
  message: ChatMessage;
  usage?: TokenUsage;
  timings?: TokenTimingStats;
}

export interface ContentGenerationAudioResponse extends ContentGenerationResponseCommon {
  modality: (typeof CONTENT_MODALITY)["AUDIO"];
  message: AudioMessage;
  usage?: TokenUsage;
}

export type ProviderTextGenerationOptions = Omit<TextGenerationOptions, "systemPrompt">;

export interface TextGenerationProviderInterface {
  /** Provider display name */
  readonly name: string;

  streamChatCompletion(
    model: string,
    messages: ChatMessage[],
    options?: ProviderTextGenerationOptions
  ): AsyncGenerator<ChatCompletionStreamChunk, void, unknown>;

  chatCompletion(
    model: string,
    messages: ChatMessage[],
    options?: ProviderTextGenerationOptions
  ): Promise<ContentGenerationTextResponse>;
}

export type ProviderAudioGenerationOptions = Omit<AudioGenerationOptions, "maxChunkChars">;

export interface AudioGenerationProviderInterface {
  /** Provider display name */
  readonly name: string;

  synthesizeAudio(
    model: string,
    text: string,
    options?: ProviderAudioGenerationOptions
  ): Promise<ContentGenerationAudioResponse>;
}
