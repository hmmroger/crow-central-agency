import { z } from "zod";
import type { MessageTemplate } from "../../utils/message-template.types.js";

export const messageRoleSchema = z.enum(["user", "assistant", "system", "function", "tool", "developer"]);
export type MessageRole = z.infer<typeof messageRoleSchema>;
export const MessageRoles = messageRoleSchema.enum;

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

export interface ChatCompletionResponse {
  model: string;
  message: ChatMessage;
  finishReason: string;
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
  reasoningEffort?: "low" | "medium" | "high";
  abortSignal?: AbortSignal;
  customPromptContext?: { [key: string]: string | undefined };
  extraParams?: Record<string, unknown>;
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
}
