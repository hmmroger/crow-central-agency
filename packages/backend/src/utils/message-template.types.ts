import type { MessageRole } from "../services/text-generation/text-generation-service.types.js";

type TemplateMessageContent = { content: string[]; keys?: string[] };

export interface MessageTemplate {
  role: MessageRole;
  content: TemplateMessageContent[];
  keys?: string[];
  isHidden?: boolean;
  isToolNudgePrompt?: boolean;
}

export type PromptContext = Record<string, string | undefined>;
