import type { MessageRole } from "../model-providers/openai-provider.types.js";

type TemplateMessageContent = { content: string[]; keys?: string[] };

export interface MessageTemplate {
  role: MessageRole;
  content: TemplateMessageContent[];
  keys?: string[];
  isHidden?: boolean;
  isToolNudgePrompt?: boolean;
}

export type PromptContext = Record<string, string | undefined>;
