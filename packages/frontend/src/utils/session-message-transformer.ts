import { AGENT_MESSAGE_KIND, type AgentMessage } from "../hooks/use-agent-interaction.types.js";

/** Content block types from the Anthropic API (SDK SessionMessage.message shape) */
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

/**
 * Transform raw SDK session messages into renderable AgentMessage[].
 * Extracts text blocks and tool_use blocks from assistant messages,
 * and text content from user messages.
 */
export function transformSessionMessages(
  sessionMessages: { type: "user" | "assistant"; message: unknown }[],
  nextId: () => string
): AgentMessage[] {
  const result: AgentMessage[] = [];

  for (const sessionMsg of sessionMessages) {
    const apiMsg = sessionMsg.message as ApiMessage;

    if (!apiMsg) {
      continue;
    }

    if (sessionMsg.type === "user") {
      const text = typeof apiMsg.content === "string" ? apiMsg.content : extractTextFromBlocks(apiMsg.content);

      if (text) {
        result.push({
          id: nextId(),
          kind: AGENT_MESSAGE_KIND.TEXT,
          text: `**You:** ${text}`,
          timestamp: Date.now(),
        });
      }
    } else if (sessionMsg.type === "assistant") {
      const blocks = Array.isArray(apiMsg.content) ? apiMsg.content : [];

      for (const block of blocks) {
        if (isTextBlock(block) && block.text.trim()) {
          result.push({
            id: nextId(),
            kind: AGENT_MESSAGE_KIND.TEXT,
            text: block.text,
            timestamp: Date.now(),
          });
        } else if (isToolUseBlock(block)) {
          result.push({
            id: nextId(),
            kind: AGENT_MESSAGE_KIND.ACTIVITY,
            toolName: block.name,
            description: summarizeToolInput(block.name, block.input),
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  return result;
}

/** Extract text from content blocks */
function extractTextFromBlocks(content: ContentBlock[] | string | undefined): string {
  if (!content || typeof content === "string") {
    return content ?? "";
  }

  return content
    .filter(isTextBlock)
    .map((block) => block.text)
    .join("\n");
}

function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === "text";
}

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
}

/** Generate a human-readable summary of tool input */
function summarizeToolInput(toolName: string, input: Record<string, unknown>): string {
  if ((toolName === "Read" || toolName === "Edit" || toolName === "Write") && typeof input.file_path === "string") {
    return input.file_path;
  }

  if (toolName === "Bash" && typeof input.command === "string") {
    return input.command.length > 80 ? input.command.substring(0, 77) + "..." : input.command;
  }

  if (toolName === "Grep" && typeof input.pattern === "string") {
    return `/${input.pattern}/`;
  }

  if (toolName === "Glob" && typeof input.pattern === "string") {
    return input.pattern;
  }

  return "";
}
