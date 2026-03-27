import type { ChatMessage, MessageRole } from "../model-providers/openai-provider.types.js";
import type { MessageTemplate, PromptContext } from "./message-template.types.js";

export const getDefaultPromptContext = (customContext?: { [key: string]: string | undefined }): PromptContext => {
  const date = new Date();
  const currentDate = date.toDateString();
  const currentTime = date.toTimeString();
  return {
    currentDate,
    currentTime,
    ...customContext,
  };
};

export const createModelMessage = (content: string, role: MessageRole): ChatMessage => {
  return {
    role,
    content,
    timestamp: Date.now(),
  };
};

export const createModelMessageFromTemplate = (
  messageTemplate: MessageTemplate,
  context?: PromptContext
): ChatMessage => {
  const contextMap: Map<string, string> = new Map();
  if (context) {
    for (const key in context) {
      if (context[key] !== undefined) {
        contextMap.set(key, context[key]);
      }
    }
  }

  let content = "";
  for (const conditionalContent of messageTemplate.content) {
    if (
      !conditionalContent.keys ||
      !conditionalContent.keys.length ||
      conditionalContent.keys.every((key) => contextMap.has(key))
    ) {
      let condContent = conditionalContent.content.join("\n");
      messageTemplate.keys?.forEach((key) => {
        const value = contextMap.get(key);
        // Whether to sub content only consider undefined, empty string is valid
        if (value !== undefined) {
          condContent = condContent.replaceAll(`{${key}}`, value);
        }
      });
      content = content.concat("\n", condContent);
    }
  }

  const { isHidden, isToolNudgePrompt } = messageTemplate;
  return {
    role: messageTemplate.role,
    content,
    isHidden,
    isToolNudgePrompt,
    timestamp: Date.now(),
  };
};

export const createMessageContentFromTemplate = (
  messageTemplate: MessageTemplate,
  context?: PromptContext
): string | undefined => {
  const chatMessage = createModelMessageFromTemplate(messageTemplate, context);
  return chatMessage.content;
};
