import { AGENT_MESSAGE_ROLE, AGENT_MESSAGE_TYPE, type AgentMessage } from "@crow-central-agency/shared";
import type { SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import { getSessionInfo, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";
import { parseToolActivity } from "../../runner/tool-activity-parser.js";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta.mjs";
import type { ContentBlockParam, MessageParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages.mjs";
import {
  COMMAND_MESSAGE_PATTERN,
  INSTRUCTION_REMINDER_PATTERN,
  LOCAL_COMMAND_OUTPUT_PATTERN,
  USER_AGENT_MESSAGE_PATTERN,
} from "../../utils/message-template.js";
import { isString } from "es-toolkit";
import { logger } from "../../utils/logger.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";

const log = logger.child({ context: "session-message-transformer" });

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

/** Type guard for SDK message payload */
function isSessionMessage(value?: unknown | null): value is TypedSessionMessage {
  const message = value as SessionMessage;
  if (typeof message !== "object" || message === null) {
    return false;
  }

  if (message.type !== "user" && message.type !== "assistant") {
    return false;
  }

  return true;
}

function isTextBlock(block: ContentBlockParam): block is TextBlockParam {
  return block.type === "text";
}

/**
 * Transform a single SessionMessage into AgentMessage[].
 * One SessionMessage may produce multiple AgentMessages (e.g., assistant with multiple content blocks).
 *
 * @param sessionMessage - A single SDK session message
 * @param baseTimestamp - Starting timestamp for ordering
 * @returns Array of AgentMessages derived from this message
 */
function transformSingleMessage(sessionMessage: SessionMessage, baseTimestamp: number): AgentMessage[] {
  if (!isSessionMessage(sessionMessage)) {
    return [];
  }

  if (sessionMessage.type === "user") {
    const rawContent = extractTextFromBlocks(sessionMessage.message.content);
    if (!rawContent) {
      return [];
    }

    const commandContent = extractCommandContent(rawContent);
    if (commandContent !== undefined) {
      if (!commandContent) {
        return [];
      }

      return [
        {
          id: sessionMessage.uuid,
          role: AGENT_MESSAGE_ROLE.SYSTEM,
          type: AGENT_MESSAGE_TYPE.COMMAND,
          content: commandContent,
          timestamp: baseTimestamp,
        },
      ];
    }

    const content = rawContent.replace(INSTRUCTION_REMINDER_PATTERN, "").replace(USER_AGENT_MESSAGE_PATTERN, "");
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

    // forkSession slices inclusively at the SessionMessage, so anchoring on a message that also
    // carried a tool_use would leave the fork ending on a tool call whose result was cut off.
    const branchAnchorId = blocks.some((block) => block.type === "tool_use") ? undefined : sessionMessage.uuid;

    for (const block of blocks) {
      if (block.type === "text" && block.text.trim()) {
        messages.push({
          id: `${sessionMessage.uuid}-${blockIndex}`,
          role: AGENT_MESSAGE_ROLE.AGENT,
          type: AGENT_MESSAGE_TYPE.TEXT,
          content: block.text,
          timestamp: baseTimestamp + blockIndex,
          branchAnchorId,
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

/**
 * Detect a persisted slash-command message and return its display content.
 * Returns the command invocation string (e.g. `/compact focus on api`),
 * an empty string for a stdout-echo message that should be dropped,
 * or undefined when the content is a normal user message.
 */
function extractCommandContent(content: string): string | undefined {
  const commandMatch = COMMAND_MESSAGE_PATTERN.exec(content);
  if (commandMatch) {
    const name = commandMatch[1].trim();
    const args = commandMatch[2]?.trim();
    return args ? `${name} ${args}` : name;
  }

  const outputMatch = LOCAL_COMMAND_OUTPUT_PATTERN.exec(content);
  if (outputMatch) {
    return "";
  }

  return undefined;
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
 * @param sessionId session ID
 * @param cwd workspace folder
 * @returns Ordered array of AgentMessages
 */
export async function loadClaudeCodeSessionMessages(sessionId: string, cwd: string): Promise<AgentMessage[]> {
  const result: AgentMessage[] = [];
  let timestampCounter = 0;
  const sessionMessages = await getSessionMessages(sessionId, { dir: cwd });

  for (const sessionMsg of sessionMessages) {
    const messages = transformSingleMessage(sessionMsg, timestampCounter);
    result.push(...messages);
    timestampCounter += Math.max(messages.length, 1);
  }

  return result;
}

/**
 * Whether a Claude session's transcript still exists on disk.
 *
 * `getSessionMessages` and resume both treat a swept/missing transcript as empty rather than
 * throwing, so existence is checked via `getSessionInfo`, which returns `undefined` when the
 * session file is gone. Reads fail open: a transient read error must never discard a live session.
 *
 * @param sessionId session ID
 * @param cwd workspace folder
 * @returns Whether session exists
 */
export async function claudeCodeSessionExists(sessionId: string, cwd: string): Promise<boolean> {
  try {
    const info = await getSessionInfo(sessionId, { dir: cwd });
    return info !== undefined;
  } catch (error) {
    log.warn(
      { sessionId, error: error instanceof Error ? error.message : String(error) },
      "Failed to read Claude session info; assuming session is valid"
    );
    return true;
  }
}

export function transformClaudeCodeSessionMessage(sessionMessage: unknown, baseTimestamp: number): AgentMessage[] {
  if (!isSessionMessage(sessionMessage)) {
    throw new AppError("Invalid session message.", APP_ERROR_CODES.VALIDATION);
  }

  const agentMessages = transformSingleMessage(sessionMessage, baseTimestamp);
  return agentMessages;
}
