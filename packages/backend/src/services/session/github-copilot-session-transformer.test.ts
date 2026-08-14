import { describe, expect, it } from "vitest";
import { AGENT_MESSAGE_TYPE } from "@crow-central-agency/shared";
import { transformGithubCopilotSessionMessage } from "./github-copilot-session-transformer.js";

interface AssistantEventFields {
  content: string;
  reasoningText?: string;
  toolRequests?: { toolCallId: string; name: string; arguments: Record<string, unknown> }[];
}

const EVENT_ID = "9a1f5c7e-3d21-4b8a-9f0c-6e2d4a7b1c53";
const MESSAGE_ID = "b7d3e912-5a64-4c0f-8e71-3f9a2c5d8b46";
const TIMESTAMP = "2026-08-13T00:00:00.000Z";

function makeAssistantEvent(fields: AssistantEventFields): unknown {
  return {
    type: "assistant.message",
    id: EVENT_ID,
    parentId: null,
    timestamp: TIMESTAMP,
    data: { messageId: MESSAGE_ID, ...fields },
  };
}

describe("transformGithubCopilotSessionMessage branch anchors", () => {
  it("anchors a tool-free assistant message on the event id, not the message id", () => {
    const messages = transformGithubCopilotSessionMessage(makeAssistantEvent({ content: "Here is the plan." }));

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe(AGENT_MESSAGE_TYPE.TEXT);
    expect(messages[0].id).toBe(MESSAGE_ID);
    expect(messages[0].branchAnchorId).toBe(EVENT_ID);
  });

  it("anchors nothing when the assistant event also requested tools", () => {
    const messages = transformGithubCopilotSessionMessage(
      makeAssistantEvent({
        content: "Reading the file.",
        toolRequests: [{ toolCallId: "tool-1", name: "read_file", arguments: { path: "/tmp/a.ts" } }],
      })
    );

    expect(messages.map((message) => message.type)).toEqual([AGENT_MESSAGE_TYPE.TOOL_USE, AGENT_MESSAGE_TYPE.TEXT]);
    for (const message of messages) {
      expect(message.branchAnchorId).toBeUndefined();
    }
  });

  it("anchors the text of a reasoning-plus-text assistant message but not the reasoning", () => {
    const messages = transformGithubCopilotSessionMessage(
      makeAssistantEvent({ content: "Here is the plan.", reasoningText: "Considering options." })
    );

    expect(messages.map((message) => message.type)).toEqual([AGENT_MESSAGE_TYPE.THINKING, AGENT_MESSAGE_TYPE.TEXT]);
    expect(messages[0].branchAnchorId).toBeUndefined();
    expect(messages[1].branchAnchorId).toBe(EVENT_ID);
  });

  it("does not anchor user messages", () => {
    const messages = transformGithubCopilotSessionMessage({
      type: "user.message",
      id: EVENT_ID,
      parentId: null,
      timestamp: TIMESTAMP,
      data: { content: "Do the thing." },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].branchAnchorId).toBeUndefined();
  });
});
