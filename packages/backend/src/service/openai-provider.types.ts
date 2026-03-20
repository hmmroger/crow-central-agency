import type { OpenAI } from "openai";
import { z } from "zod";

export const messageRoleSchema = z.enum(["user", "assistant", "system", "function", "tool"]);
export type MessageRole = z.infer<typeof messageRoleSchema>;
export const MessageRoles = messageRoleSchema.enum;

export interface ChatMessage {
  role: MessageRole;
  content?: string;
  reasoningContent?: string;

  toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];

  // Tool call ID of the tool response
  toolCallId?: string;

  // Models may required signature to be sent back
  thoughtSignature?: string;

  tokenUsage?: OpenAI.Completions.CompletionUsage;

  timestamp: number;
}

export interface LlamaTimingStats {
  prompt_n: number;
  prompt_ms: number;
  prompt_per_token_ms: number;
  prompt_per_second: number;
  predicted_n: number;
  predicted_ms: number;
  predicted_per_token_ms: number;
  predicted_per_second: number;
}

export interface LlamaLoraAdapter {
  id: string;
  scale: number;
  path: string;
}

export const streamEventTypeSchema = z.enum([
  "content",
  "thinking",

  // assistant message with tool use chunk done
  "tooluse",

  // single assistant message completed
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
  usage?: OpenAI.Completions.CompletionUsage;
  timings?: LlamaTimingStats;

  // messagedone / tooluse: from assistant role, indicate the tool to use
  toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  thoughtSignature?: string;

  // toolresp: whether tool result indicates error
  isToolError?: boolean;
}

export interface OpenAIProviderConfig {
  baseURL: string;
  apiKey?: string;
}

export interface TextGenerationOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
  abortSignal?: AbortSignal;
  extraParams?: Record<string, unknown>;
}
