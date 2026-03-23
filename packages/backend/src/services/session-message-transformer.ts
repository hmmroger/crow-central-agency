import { AGENT_MESSAGE_ROLE, type AgentMessage } from "@crow-central-agency/shared";
import type { SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import { parseToolActivity } from "../stream/tool-activity-parser.js";

/** Content block types from the Anthropic API (inside SessionMessage.message) */
interface TextBlock {
  type: "text";
  text: string;
}

interface ToolUseBlock {
  type: "tool_use";
  name: string;
  input: Record<string, unknown>;
}

type ContentBlock = TextBlock | ToolUseBlock | { type: string };

interface ApiMessage {
  role?: string;
  content?: string | ContentBlock[];
}

function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === "text";
}

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
}

/**
 * Transform a single SessionMessage into AgentMessage[].
 * One SessionMessage may produce multiple AgentMessages (e.g., assistant with multiple content blocks).
 */
function transformSingle(sessionMsg: SessionMessage, timestampCounter: number): AgentMessage[] {
  const apiMsg = sessionMsg.message as ApiMessage;

  if (!apiMsg) {
    return [];
  }

  if (sessionMsg.type === "user") {
    const content = typeof apiMsg.content === "string" ? apiMsg.content : extractTextFromBlocks(apiMsg.content);

    if (!content) {
      return [];
    }

    return [
      {
        id: sessionMsg.uuid,
        role: AGENT_MESSAGE_ROLE.USER,
        content,
        timestamp: timestampCounter,
      },
    ];
  }

  if (sessionMsg.type === "assistant") {
    const blocks = Array.isArray(apiMsg.content) ? apiMsg.content : [];
    const messages: AgentMessage[] = [];
    let blockIndex = 0;

    for (const block of blocks) {
      if (isTextBlock(block) && block.text.trim()) {
        messages.push({
          id: `${sessionMsg.uuid}-${blockIndex}`,
          role: AGENT_MESSAGE_ROLE.AGENT,
          content: block.text,
          timestamp: timestampCounter + blockIndex,
        });
        blockIndex++;
      } else if (isToolUseBlock(block)) {
        messages.push({
          id: `${sessionMsg.uuid}-${blockIndex}`,
          role: AGENT_MESSAGE_ROLE.SYSTEM,
          content: parseToolActivity(block.name, block.input),
          toolName: block.name,
          timestamp: timestampCounter + blockIndex,
        });
        blockIndex++;
      }
    }

    return messages;
  }

  return [];
}

/** Extract text content from an array of content blocks */
function extractTextFromBlocks(content: ContentBlock[] | string | undefined): string {
  if (!content || typeof content === "string") {
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
    const messages = transformSingle(sessionMsg, timestampCounter);
    result.push(...messages);
    timestampCounter += Math.max(messages.length, 1);
  }

  return result;
}

/**
 * Transform a single SessionMessage and return AgentMessage[].
 * Used by SessionManager.addMessage() for individual messages during streaming.
 *
 * @param sessionMessage - A single SDK session message
 * @param baseTimestamp - Starting timestamp for ordering
 * @returns Array of AgentMessages derived from this message
 */
export function transformSingleMessage(sessionMessage: SessionMessage, baseTimestamp: number): AgentMessage[] {
  return transformSingle(sessionMessage, baseTimestamp);
}
