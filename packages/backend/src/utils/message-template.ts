import type { ChatMessage, MessageRole } from "../services/content-generation/content-generation.types.js";
import type { MessageTemplate, PromptContext } from "./message-template.types.js";

export const USER_AGENT_MESSAGE_PREFIX = "[__## ";
export const USER_AGENT_MESSAGE_SUFFIX = " ##__]: ";
/** Strips the `[__## <datetime> ##__]: ` prefix from a user message */
export const USER_AGENT_MESSAGE_PATTERN = /^\[__## .+? ##__]: /;

const INSTRUCTION_REMINDER_OPEN = "<system-reminder>";
const INSTRUCTION_REMINDER_CLOSE = "</system-reminder>";
export const INSTRUCTION_REMINDER_PATTERN = /^<system-reminder>[\s\S]*?<\/system-reminder>\s*/;

/** Captures a slash-command user message the SDK persists; group 1 is the command name, group 2 the args */
export const COMMAND_MESSAGE_PATTERN =
  /^\s*<command-name>(\/[\s\S]*?)<\/command-name>(?:[\s\S]*?<command-args>([\s\S]*?)<\/command-args>)?/;

/** Matches the `<local-command-stdout>` echo the SDK persists after running a slash command */
export const LOCAL_COMMAND_OUTPUT_PATTERN = /^\s*<local-command-stdout>[\s\S]*?<\/local-command-stdout>/;

export const getDefaultPromptContext = (
  customContext?: { [key: string]: string | undefined },
  tz?: string
): PromptContext => {
  const date = new Date();
  const currentDate = formatUserDate(date, tz);
  const currentTime = formatUserTime(date, tz);
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

export const createMessageContentFromTemplate = (messageTemplate: MessageTemplate, context?: PromptContext): string => {
  const chatMessage = createModelMessageFromTemplate(messageTemplate, context);
  return chatMessage.content || "";
};

export const formatUserDate = (date: Date, timezone?: string): string => {
  if (timezone) {
    return date.toLocaleDateString("en-US", {
      timeZone: timezone,
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return date.toDateString();
};

export const formatUserTime = (date: Date, timezone?: string): string => {
  if (timezone) {
    const timeStr = date.toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "longOffset",
    });
    return `${timeStr} (${timezone})`;
  }

  return date.toTimeString();
};

export const formatUserDateTime = (date: Date, timezone?: string): string => {
  return `${formatUserDate(date, timezone)} ${formatUserTime(date, timezone)}`;
};

export const userMessageForAgent = (
  date: Date,
  message: string,
  timezone?: string,
  instructionReminder?: string
): string => {
  const userMessage = `${USER_AGENT_MESSAGE_PREFIX}${formatUserDateTime(date, timezone)}${USER_AGENT_MESSAGE_SUFFIX}${message}`;
  if (!instructionReminder) {
    return userMessage;
  }

  return `${INSTRUCTION_REMINDER_OPEN}\n${instructionReminder}\n${INSTRUCTION_REMINDER_CLOSE}\n\n${userMessage}`;
};
