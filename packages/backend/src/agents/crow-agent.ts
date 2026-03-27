import {
  PERMISSION_MODE,
  TOOL_MODE,
  TIME_MODE,
  CLAUDE_HAIKU_MODEL,
  type AgentConfig,
} from "@crow-central-agency/shared";
import { env } from "../config/env.js";

/** Well-known UUID for the Crow system agent */
export const CROW_SYSTEM_AGENT_ID = "00000000-0000-0000-0000-000000000001";

const CROW_SYSTEM_AGENT_NAME = "Crow";
const CROW_SYSTEM_AGENT_PERSONA = [""];
const CROW_BIRTHDAY = "1970-01-01T00:00:00Z";

/** Build the Crow system agent config — built-in, immutable, not persisted */
export function getCrowAgent(): AgentConfig {
  return {
    id: CROW_SYSTEM_AGENT_ID,
    name: CROW_SYSTEM_AGENT_NAME,
    description: "",
    workspace: env.CROW_SYSTEM_PATH,
    persona: CROW_SYSTEM_AGENT_PERSONA.join("\n"),
    model: CLAUDE_HAIKU_MODEL,
    permissionMode: PERMISSION_MODE.DEFAULT,
    settingSources: [],
    availableTools: [],
    toolConfig: {
      mode: TOOL_MODE.RESTRICTED,
      tools: ["Glob", "Grep", "Read", "WebFetch", "WebSearch"],
      autoApprovedTools: ["Glob", "Grep", "Read", "WebFetch", "WebSearch"],
    },
    loop: {
      enabled: false,
      daysOfWeek: [],
      timeMode: TIME_MODE.EVERY,
      prompt: "",
    },
    isSystemAgent: true,
    createdAt: CROW_BIRTHDAY,
    updatedAt: CROW_BIRTHDAY,
  };
}
