import { PERMISSION_MODE, type AgentConfig } from "@crow-central-agency/shared";
import { env } from "../config/env.js";
import { CLAUDE_HAIKU_MODEL } from "@crow-central-agency/shared";

export const CROW_SYSTEM_AGENT_ID = "__super_crow__";
const CROW_SYSTEM_AGENT_NAME = "Crow";
const CROW_SYSTEM_AGENT_PERSONA = [""];
const CROW_BIRTHDAY = "1970-01-01T00:00:00Z";

export function getCrowAgent(): AgentConfig {
  const workspacePath = env.CROW_SYSTEM_PATH;

  return {
    id: CROW_SYSTEM_AGENT_ID,
    name: CROW_SYSTEM_AGENT_NAME,
    description: "",
    workspace: workspacePath,
    persona: CROW_SYSTEM_AGENT_PERSONA.join("\n"),
    model: CLAUDE_HAIKU_MODEL,
    permissionMode: PERMISSION_MODE.DEFAULT,
    settingSources: [],
    availableTools: [],
    toolConfig: {
      mode: "restricted",
      tools: ["Glob", "Grep", "Read", "WebFetch", "WebSearch"],
      autoApprovedTools: ["Glob", "Grep", "Read", "WebFetch", "WebSearch"],
    },
    loop: {
      enabled: false,
      daysOfWeek: [],
      timeMode: "every",
      prompt: "",
    },
    isSystemAgent: true,
    createdAt: CROW_BIRTHDAY,
    updatedAt: CROW_BIRTHDAY,
  };
}
