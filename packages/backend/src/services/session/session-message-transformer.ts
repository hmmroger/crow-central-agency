import { AGENT_MESSAGE_ROLE, AGENT_MESSAGE_TYPE, type AgentMessage } from "@crow-central-agency/shared";
import type { SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import { parseToolActivity } from "../../runner/tool-activity-parser.js";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta.mjs";
import type { ContentBlockParam, MessageParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages.mjs";
import { USER_AGENT_MESSAGE_PATTERN } from "../../utils/message-template.js";
import { isString } from "es-toolkit";

type TypedSessionMessage = SessionMessage &
  (
    | {
        type: "assistant";
        message: BetaMessage;
      }
    | {
        type: "user";
        message: MessageParam;
      }
  );

/**
 * Transform a single SessionMessage into AgentMessage[].
 * One SessionMessage may produce multiple AgentMessages (e.g., assistant with multiple content blocks).
 *
 * @param sessionMessage - A single SDK session message
 * @param baseTimestamp - Starting timestamp for ordering
 * @returns Array of AgentMessages derived from this message
 */
export function transformSingleMessage(sessionMessage: SessionMessage, baseTimestamp: number): AgentMessage[] {
  if (!isSessionMessage(sessionMessage)) {
    return [];
  }

  if (sessionMessage.type === "user") {
    let content = extractTextFromBlocks(sessionMessage.message.content);
    if (!content) {
      return [];
    }

    content = content.replace(USER_AGENT_MESSAGE_PATTERN, "");
    return [
      {
        id: sessionMessage.uuid,
        role: AGENT_MESSAGE_ROLE.USER,
        type: AGENT_MESSAGE_TYPE.TEXT,
        content,
        timestamp: baseTimestamp,
      },
    ];
  }

  if (sessionMessage.type === "assistant") {
    const blocks = Array.isArray(sessionMessage.message.content) ? sessionMessage.message.content : [];
    const messages: AgentMessage[] = [];
    let blockIndex = 0;

    for (const block of blocks) {
      if (block.type === "text" && block.text.trim()) {
        messages.push({
          id: `${sessionMessage.uuid}-${blockIndex}`,
          role: AGENT_MESSAGE_ROLE.AGENT,
          type: AGENT_MESSAGE_TYPE.TEXT,
          content: block.text,
          timestamp: baseTimestamp + blockIndex,
        });
        blockIndex++;
      } else if (block.type === "tool_use") {
        messages.push({
          id: `${sessionMessage.uuid}-${blockIndex}`,
          role: AGENT_MESSAGE_ROLE.SYSTEM,
          type: AGENT_MESSAGE_TYPE.TOOL_USE,
          content: parseToolActivity(block.name, block.input),
          toolName: block.name,
          toolInput: block.input as Record<string, unknown>,
          timestamp: baseTimestamp + blockIndex,
        });
        blockIndex++;
      } else if (block.type === "thinking") {
        messages.push({
          id: `${sessionMessage.uuid}-${blockIndex}`,
          role: AGENT_MESSAGE_ROLE.AGENT,
          type: AGENT_MESSAGE_TYPE.THINKING,
          content: block.thinking,
          timestamp: baseTimestamp + blockIndex,
        });
        blockIndex++;
      } else if (block.type === "redacted_thinking") {
        messages.push({
          id: `${sessionMessage.uuid}-${blockIndex}`,
          role: AGENT_MESSAGE_ROLE.AGENT,
          type: AGENT_MESSAGE_TYPE.THINKING,
          content: "[Thinking redacted by API]",
          timestamp: baseTimestamp + blockIndex,
        });
        blockIndex++;
      }
    }

    return messages;
  }

  return [];
}

/** Extract text content from an array of content blocks */
function extractTextFromBlocks(content: ContentBlockParam[] | string | undefined): string {
  if (!content || isString(content)) {
    return content ?? "";
  }

  return content
    .filter(isTextBlock)
    .map((block) => block.text)
    .join("\n");
}

/**
 * Transform an array of SDK SessionMessages into AgentMessage[].
 * Uses incrementing timestamps for ordering since SDK SessionMessages lack wall-clock time.
 *
 * @param sessionMessages - Raw SDK session messages
 * @returns Ordered array of AgentMessages
 */
export function transformSessionMessages(sessionMessages: SessionMessage[]): AgentMessage[] {
  const result: AgentMessage[] = [];
  let timestampCounter = 0;

  for (const sessionMsg of sessionMessages) {
    const messages = transformSingleMessage(sessionMsg, timestampCounter);
    result.push(...messages);
    timestampCounter += Math.max(messages.length, 1);
  }

  return result;
}

/** Type guard for SDK message payload */
function isSessionMessage(value?: SessionMessage | null): value is TypedSessionMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (value.type !== "user" && value.type !== "assistant") {
    return false;
  }

  return true;
}

function isTextBlock(block: ContentBlockParam): block is TextBlockParam {
  return block.type === "text";
}
