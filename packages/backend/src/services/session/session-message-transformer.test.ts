import { describe, expect, it } from "vitest";
import { AGENT_MESSAGE_TYPE } from "@crow-central-agency/shared";
import type { SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import { transformClaudeCodeSessionMessage } from "./session-message-transformer.js";

const MESSAGE_UUID = "6d2c9d2e-0f3b-4d1a-9c1a-2f2a1b8c4d5e";

function makeSessionMessage(type: "user" | "assistant", message: unknown): SessionMessage {
  return {
    type,
    uuid: MESSAGE_UUID,
    session_id: "session-1",
    message,
    parent_tool_use_id: null,
    parent_agent_id: null,
  };
}

function makeAssistantMessage(content: unknown[]): SessionMessage {
  return makeSessionMessage("assistant", { role: "assistant", content });
}

describe("transformClaudeCodeSessionMessage branch anchors", () => {
  it("anchors a text-only assistant message on its parent uuid", () => {
    const messages = transformClaudeCodeSessionMessage(
      makeAssistantMessage([{ type: "text", text: "Here is the plan." }]),
      0
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe(AGENT_MESSAGE_TYPE.TEXT);
    expect(messages[0].branchAnchorId).toBe(MESSAGE_UUID);
    expect(messages[0].id).toBe(`${MESSAGE_UUID}-0`);
  });

  it("anchors every text block of a multi-text assistant message on the same parent uuid", () => {
    const messages = transformClaudeCodeSessionMessage(
      makeAssistantMessage([
        { type: "text", text: "First." },
        { type: "text", text: "Second." },
      ]),
      0
    );

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.branchAnchorId)).toEqual([MESSAGE_UUID, MESSAGE_UUID]);
  });

  it("anchors no block when the assistant message also carries a tool_use", () => {
    const messages = transformClaudeCodeSessionMessage(
      makeAssistantMessage([
        { type: "text", text: "Reading the file." },
        { type: "tool_use", id: "tool-1", name: "Read", input: { file_path: "/tmp/a.ts" } },
      ]),
      0
    );

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.type)).toEqual([AGENT_MESSAGE_TYPE.TEXT, AGENT_MESSAGE_TYPE.TOOL_USE]);
    for (const message of messages) {
      expect(message.branchAnchorId).toBeUndefined();
    }
  });

  it("anchors no block when the tool_use precedes the text", () => {
    const messages = transformClaudeCodeSessionMessage(
      makeAssistantMessage([
        { type: "tool_use", id: "tool-1", name: "Read", input: { file_path: "/tmp/a.ts" } },
        { type: "text", text: "Done reading." },
      ]),
      0
    );

    expect(messages).toHaveLength(2);
    for (const message of messages) {
      expect(message.branchAnchorId).toBeUndefined();
    }
  });

  it("does not anchor thinking or redacted_thinking blocks", () => {
    const messages = transformClaudeCodeSessionMessage(
      makeAssistantMessage([
        { type: "thinking", thinking: "Considering options.", signature: "sig" },
        { type: "redacted_thinking", data: "redacted" },
      ]),
      0
    );

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.type)).toEqual([
      AGENT_MESSAGE_TYPE.THINKING,
      AGENT_MESSAGE_TYPE.THINKING,
    ]);
    for (const message of messages) {
      expect(message.branchAnchorId).toBeUndefined();
    }
  });

  it("anchors only the text block of a thinking-plus-text assistant message", () => {
    const messages = transformClaudeCodeSessionMessage(
      makeAssistantMessage([
        { type: "thinking", thinking: "Considering options.", signature: "sig" },
        { type: "text", text: "Here is the plan." },
      ]),
      0
    );

    expect(messages).toHaveLength(2);
    expect(messages[0].branchAnchorId).toBeUndefined();
    expect(messages[1].branchAnchorId).toBe(MESSAGE_UUID);
  });

  it("does not anchor user messages", () => {
    const messages = transformClaudeCodeSessionMessage(
      makeSessionMessage("user", { role: "user", content: [{ type: "text", text: "Do the thing." }] }),
      0
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].branchAnchorId).toBeUndefined();
  });

  it("does not anchor slash-command messages", () => {
    const messages = transformClaudeCodeSessionMessage(
      makeSessionMessage("user", {
        role: "user",
        content: [{ type: "text", text: "<command-name>/compact</command-name>" }],
      }),
      0
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe(AGENT_MESSAGE_TYPE.COMMAND);
    expect(messages[0].branchAnchorId).toBeUndefined();
  });
});
