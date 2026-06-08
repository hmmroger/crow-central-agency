import { AGENT_MESSAGE_ROLE, AGENT_MESSAGE_TYPE, type AgentMessage } from "@crow-central-agency/shared";
import type { AssistantMessageEvent, CopilotClient, CopilotSession, SessionEvent } from "@github/copilot-sdk";
import { parseToolActivity } from "../../runner/tool-activity-parser.js";
import { USER_AGENT_MESSAGE_PATTERN } from "../../utils/message-template.js";
import { logger } from "../../utils/logger.js";

const log = logger.child({ context: "github-copilot-session-transformer" });

/** Transform a persisted Copilot SessionEvent into AgentMessages (the assistant message is expanded). */
function transformSessionEvent(event: SessionEvent): AgentMessage[] {
  const timestamp = new Date(event.timestamp).getTime();

  if (event.type === "user.message") {
    const content = event.data.content.replace(USER_AGENT_MESSAGE_PATTERN, "").trim();
    if (!content) {
      return [];
    }

    return [{ id: event.id, role: AGENT_MESSAGE_ROLE.USER, type: AGENT_MESSAGE_TYPE.TEXT, content, timestamp }];
  }

  if (event.type === "assistant.message") {
    return transformAssistantMessage(event, timestamp);
  }

  return [];
}

/** Expand an assistant message in natural order: reasoning, then tool calls, then the text response. */
function transformAssistantMessage(event: AssistantMessageEvent, timestamp: number): AgentMessage[] {
  const messages: AgentMessage[] = [];

  const reasoning = event.data.reasoningText?.trim();
  if (reasoning) {
    messages.push({
      id: `${event.data.messageId}-reasoning`,
      role: AGENT_MESSAGE_ROLE.AGENT,
      type: AGENT_MESSAGE_TYPE.THINKING,
      content: reasoning,
      timestamp,
    });
  }

  for (const toolRequest of event.data.toolRequests ?? []) {
    const toolInput: Record<string, unknown> = toolRequest.arguments ?? {};
    messages.push({
      id: toolRequest.toolCallId,
      role: AGENT_MESSAGE_ROLE.SYSTEM,
      type: AGENT_MESSAGE_TYPE.TOOL_USE,
      content: parseToolActivity(toolRequest.name, toolInput),
      toolName: toolRequest.name,
      toolInput,
      timestamp,
    });
  }

  const content = event.data.content.trim();
  if (content) {
    messages.push({
      id: event.data.messageId,
      role: AGENT_MESSAGE_ROLE.AGENT,
      type: AGENT_MESSAGE_TYPE.TEXT,
      content,
      timestamp,
    });
  }

  return messages;
}

function isCopilotSessionEvent(value: unknown): value is SessionEvent {
  return typeof value === "object" && value !== null && "type" in value;
}

/** Transform a live Copilot SessionEvent (carried by a MESSAGE_DONE stream event) into AgentMessages. */
export function transformGithubCopilotSessionMessage(message: unknown): AgentMessage[] {
  if (!isCopilotSessionEvent(message)) {
    return [];
  }

  return transformSessionEvent(message);
}

/**
 * Load a Copilot session's history as AgentMessage[]. Copilot has no off-disk read API, so we resume
 * the session to read its events, then disconnect. A session that can't be resumed (e.g. just created,
 * not yet flushed) is treated as empty rather than an error.
 */
export async function loadGithubCopilotSessionMessages(
  client: CopilotClient,
  sessionId: string
): Promise<AgentMessage[]> {
  let session: CopilotSession;
  try {
    session = await client.resumeSession(sessionId, { suppressResumeEvent: true });
  } catch (error) {
    log.info({ sessionId, error }, "Could not resume Copilot session for read; returning empty history");
    return [];
  }

  let events: SessionEvent[];
  try {
    events = await session.getEvents();
  } finally {
    await session.disconnect().catch((error) => {
      log.warn({ sessionId, error }, "Failed to disconnect Copilot session after read");
    });
  }

  const messages: AgentMessage[] = [];
  for (const event of events) {
    if (event.ephemeral || event.agentId) {
      continue;
    }

    messages.push(...transformSessionEvent(event));
  }

  return messages;
}
