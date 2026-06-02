import { AGENT_MESSAGE_ROLE, AGENT_MESSAGE_TYPE, type AgentMessage } from "@crow-central-agency/shared";
import type { CopilotClient, SessionEvent } from "@github/copilot-sdk";
import { parseToolActivity } from "../../runner/tool-activity-parser.js";
import { logger } from "../../utils/logger.js";

const log = logger.child({ context: "github-copilot-session-transformer" });

/**
 * Transform a single persisted Copilot SessionEvent into an AgentMessage.
 * Only the message-bearing event types map onto our canonical model; all other
 * lifecycle/telemetry events (turn markers, usage, hooks, etc.) are skipped.
 *
 * @param event - A single SDK session event
 * @param timestamp - Ordering timestamp for the produced message
 * @returns The mapped AgentMessage, or undefined when the event carries no displayable content
 */
function transformSessionEvent(event: SessionEvent, timestamp: number): AgentMessage | undefined {
  if (event.type === "user.message") {
    const content = event.data.content.trim();
    if (!content) {
      return undefined;
    }

    return {
      id: event.id,
      role: AGENT_MESSAGE_ROLE.USER,
      type: AGENT_MESSAGE_TYPE.TEXT,
      content,
      timestamp,
    };
  }

  if (event.type === "assistant.message") {
    const content = event.data.content.trim();
    if (!content) {
      return undefined;
    }

    return {
      id: event.id,
      role: AGENT_MESSAGE_ROLE.AGENT,
      type: AGENT_MESSAGE_TYPE.TEXT,
      content,
      timestamp,
    };
  }

  if (event.type === "assistant.reasoning") {
    const content = event.data.content.trim();
    if (!content) {
      return undefined;
    }

    return {
      id: event.id,
      role: AGENT_MESSAGE_ROLE.AGENT,
      type: AGENT_MESSAGE_TYPE.THINKING,
      content,
      timestamp,
    };
  }

  if (event.type === "tool.execution_start") {
    const toolInput = event.data.arguments ?? {};
    return {
      id: event.id,
      role: AGENT_MESSAGE_ROLE.SYSTEM,
      type: AGENT_MESSAGE_TYPE.TOOL_USE,
      content: parseToolActivity(event.data.toolName, toolInput),
      toolName: event.data.toolName,
      toolInput,
      timestamp,
    };
  }

  return undefined;
}

/**
 * Load a Copilot session's history as AgentMessage[].
 * Unlike Claude Code (which reads session files off disk via a static API), Copilot exposes
 * history only through a live session object, so we resume the session purely to read its
 * events, then disconnect to release the in-memory resources (on-disk state is preserved).
 *
 * @param client - A started, connected Copilot client shared across all read operations
 * @param sessionId - The session whose history to load
 * @returns Ordered AgentMessages derived from the session's persisted events
 */
export async function loadGithubCopilotSessionMessages(
  client: CopilotClient,
  sessionId: string
): Promise<AgentMessage[]> {
  const session = await client.resumeSession(sessionId, { suppressResumeEvent: true });
  let events: SessionEvent[];
  try {
    events = await session.getEvents();
  } finally {
    // Teardown failure must not mask a getEvents() error, so log and swallow it here.
    await session.disconnect().catch((error) => {
      log.warn({ sessionId, error }, "Failed to disconnect Copilot session after read");
    });
  }

  const messages: AgentMessage[] = [];
  let timestamp = 0;
  for (const event of events) {
    if (event.ephemeral) {
      continue;
    }

    const message = transformSessionEvent(event, timestamp);
    if (message) {
      messages.push(message);
      timestamp++;
    }
  }

  return messages;
}
