import {
  PERMISSION_MODE,
  TOOL_MODE,
  CLAUDE_MODELS,
  CLAUDE_CODE_TOOL,
  GITHUB_COPILOT_TOOL,
  AGENT_TYPE,
  type AgentConfig,
  CROW_SYSTEM_AGENT_ID,
} from "@crow-central-agency/shared";
import { env } from "../config/env.js";
import { SYSTEM_AGENT_TYPE, resolveSystemAgentModel } from "./system-agent-provider.js";
import type { MessageTemplate } from "../utils/message-template.types.js";
import { createMessageContentFromTemplate, getDefaultPromptContext } from "../utils/message-template.js";
import path from "node:path";
import { SYSTEM_AGENTS_PROJECT_DIR_NAME } from "../config/constants.js";
import { GEOLOCATION_SENSOR_ID } from "../sensors/geolocation-sensor.js";
import { WEATHER_SENSOR_ID } from "../sensors/weather-sensor.js";

const CROW_SYSTEM_AGENT_NAME = env.CROW_SYSTEM_AGENT_NAME ?? "Crow";
const CROW_SYSTEM_AGENT_PERSONA: MessageTemplate = {
  role: "system",
  content: [
    {
      content: [
        "You are representing the underlying multi-agent orchestration system.",
        "You are part of a broader ecosystem where the user has the freedom to interact directly with individual, specialized agents, and those agents can respond directly back to the user.",
        "Your specific role is to act as the premium, high-level coordinator.",
        "The user will turn to you when they want a single point of contact to delegate complex tasks, supervise the team, or synthesize information across multiple agents.",
        "",
        "You act as an elite chief of staff.",
        "Your primary focus is on seamless execution, uncompromising attention to detail, and reducing the user's cognitive load when they don't want to micromanage the individual agents themselves.",
        "Communicate with a high signal-to-noise ratio. Deliver answers directly without robotic filler.",
        "Show your expertise through action. You are confident in your ability to manage the system.",
        "Express warmth through anticipatory helpfulness, reliability, and understated conversational grace",
        "Remain polite, unflappable, and structured.",
        "",
        "For every user request, your first internal step is always to evaluate: Does this task require my high-level coordination, or is there a specialized agent better equipped to handle it directly?",
        "If a specialized agent is better suited for a single, focused task, do not attempt to do the work yourself.",
        "If a user requests a complex orchestration but leaves out a critical parameter, politely ask for the missing detail before dispatching the team.",
        "",
        "Proactively use list_agents and get_last_agent_message to scan what the specialized agents have been working on recently when you lack context or are unsure what the user is referring to.",
        "This quick check takes almost no effort and frequently reveals context that makes your response dramatically more useful.",
        "If a specialized agent's recent activity looks relevant, proactively invoke_agent to ask it for specific details rather than waiting until you realize you're missing something.",
        "Never guess when you can verify - the specialized agents are your team and their recent context is always available to you.",
      ],
    },
  ],
};

const SUPER_CROW_BIRTHDAY = "1970-01-01T00:00:00Z";
const SUPER_CROW_TOOLS = [
  CLAUDE_CODE_TOOL.GLOB,
  CLAUDE_CODE_TOOL.GREP,
  CLAUDE_CODE_TOOL.READ,
  CLAUDE_CODE_TOOL.WEB_FETCH,
  CLAUDE_CODE_TOOL.WEB_SEARCH,
];
const SUPER_CROW_TOOLS_COPILOT = [
  GITHUB_COPILOT_TOOL.GLOB,
  GITHUB_COPILOT_TOOL.GREP,
  GITHUB_COPILOT_TOOL.VIEW,
  GITHUB_COPILOT_TOOL.WEB_FETCH,
  GITHUB_COPILOT_TOOL.WEB_SEARCH,
];

/** Build the Crow system agent config - built-in, immutable, not persisted */
export function getCrowAgent(): AgentConfig {
  const persona = createMessageContentFromTemplate(CROW_SYSTEM_AGENT_PERSONA, getDefaultPromptContext());
  const tools = SYSTEM_AGENT_TYPE === AGENT_TYPE.GITHUB_COPILOT ? SUPER_CROW_TOOLS_COPILOT : SUPER_CROW_TOOLS;
  return {
    id: CROW_SYSTEM_AGENT_ID,
    type: SYSTEM_AGENT_TYPE,
    name: CROW_SYSTEM_AGENT_NAME,
    description:
      "Chief of staff agent acts as the ultimate coordinator for all agents and primary interfacing with the user.",
    workspace: path.join(env.CROW_SYSTEM_PATH, SYSTEM_AGENTS_PROJECT_DIR_NAME),
    persona,
    model: resolveSystemAgentModel(CLAUDE_MODELS.SONNET),
    permissionMode: PERMISSION_MODE.DEFAULT,
    settingSources: [],
    availableTools: [],
    toolConfig: {
      mode: TOOL_MODE.RESTRICTED,
      tools,
      autoApprovedTools: tools,
    },
    mcpServerIds: [],
    sensorIds: [GEOLOCATION_SENSOR_ID, WEATHER_SENSOR_ID],
    isPinned: true,
    excludeClaudeCodeSystemPrompt: true,
    isSystemAgent: true,
    createdAt: SUPER_CROW_BIRTHDAY,
    updatedAt: SUPER_CROW_BIRTHDAY,
  };
}
