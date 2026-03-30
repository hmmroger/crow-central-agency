import { PERMISSION_MODE, TOOL_MODE, CLAUDE_MODELS, type AgentConfig } from "@crow-central-agency/shared";
import { env } from "../config/env.js";
import type { MessageTemplate } from "../utils/message-template.types.js";
import { createMessageContentFromTemplate, getDefaultPromptContext } from "../utils/message-template.js";

/** Well-known ID for the Crow system agent */
export const CROW_SYSTEM_AGENT_ID = "__super_crow__";

const CROW_SYSTEM_AGENT_NAME = "Crow";
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
      ],
    },
  ],
};

const SUPER_CROW_BIRTHDAY = "1970-01-01T00:00:00Z";
const SUPER_CROW_TOOLS = ["Glob", "Grep", "Read", "WebFetch", "WebSearch"];

/** Build the Crow system agent config — built-in, immutable, not persisted */
export function getCrowAgent(): AgentConfig {
  const persona = createMessageContentFromTemplate(CROW_SYSTEM_AGENT_PERSONA, getDefaultPromptContext());
  return {
    id: CROW_SYSTEM_AGENT_ID,
    name: CROW_SYSTEM_AGENT_NAME,
    description: "Chief of staff agent acts as the ultimate coordinator for all agents.",
    workspace: env.CROW_SYSTEM_PATH,
    persona,
    model: CLAUDE_MODELS.HAIKU,
    permissionMode: PERMISSION_MODE.DEFAULT,
    settingSources: [],
    availableTools: [],
    toolConfig: {
      mode: TOOL_MODE.RESTRICTED,
      tools: SUPER_CROW_TOOLS,
      autoApprovedTools: SUPER_CROW_TOOLS,
    },
    isReplaceSystemPrompt: true,
    isSystemAgent: true,
    createdAt: SUPER_CROW_BIRTHDAY,
    updatedAt: SUPER_CROW_BIRTHDAY,
  };
}
