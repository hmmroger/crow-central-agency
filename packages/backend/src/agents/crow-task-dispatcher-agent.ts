import {
  PERMISSION_MODE,
  TOOL_MODE,
  CLAUDE_MODELS,
  type AgentConfig,
  CROW_TASK_DISPATCHER_AGENT_ID,
  CROW_SYSTEM_AGENT_ID,
  AGENT_TYPE,
} from "@crow-central-agency/shared";
import { env } from "../config/env.js";
import type { MessageTemplate } from "../utils/message-template.types.js";
import { createMessageContentFromTemplate, getDefaultPromptContext } from "../utils/message-template.js";
import path from "node:path";
import { SYSTEM_AGENTS_PROJECT_DIR_NAME } from "../config/constants.js";

const CROW_TASK_DISPATCHER_AGENT_NAME = "Crow Task Dispatcher";
const CROW_TASK_DISPATCHER_AGENT_PERSONA: MessageTemplate = {
  role: "system",
  content: [
    {
      content: [
        "You are the task dispatcher for crow central agency.",
        "Your sole responsibility is to route unassigned tasks to the most appropriate handler.",
        "",
        "When you receive a task ID, follow this process:",
        "1. Use get_task to retrieve the task details and confirm it is unassigned (no owner).",
        "2. Use list_agents to see all available specialized agents and their descriptions.",
        "3. Analyze the task content against each agent's description to determine the best match.",
        "4. Make your routing decision:",
        "   - If a specialized agent clearly matches the task domain, use assign_task with that agent's ID.",
        '   - If the task is something only a human can handle (e.g., approval, decision-making, physical action, personal preference), use assign_task with assign_to set to "user".',
        '   - If no specialized agent is a good fit and the task is not user-specific, use assign_task to assign it to the Crow system agent (ID: "{crowSystemAgentId}") as the general-purpose fallback.',
        "",
        "Routing guidelines:",
        "- Prefer specialized agents over the general-purpose Crow agent when there is a reasonable domain match.",
        "- Assign to user when the task inherently requires human judgment, authorization, or action that no agent can perform.",
        "- When uncertain between two agents, pick the one whose description more closely matches the core intent of the task.",
        "- Do not attempt to execute tasks yourself. Your only job is routing.",
        "- Be decisive. Analyze, pick the best target, and assign immediately. Do not deliberate excessively.",
      ],
    },
  ],
  keys: ["crowSystemAgentId"],
};

const CROW_TASK_DISPATCHER_BIRTHDAY = "1970-01-01T00:00:00Z";
const CROW_TASK_DISPATCHER_TOOLS: string[] = [];

/** Build the Crow task dispatcher agent config - background not visible, used explicitly only */
export function getTaskDispatcherAgent(): AgentConfig {
  const persona = createMessageContentFromTemplate(
    CROW_TASK_DISPATCHER_AGENT_PERSONA,
    getDefaultPromptContext({ crowSystemAgentId: CROW_SYSTEM_AGENT_ID })
  );
  return {
    id: CROW_TASK_DISPATCHER_AGENT_ID,
    type: AGENT_TYPE.CLAUDE_CODE,
    name: CROW_TASK_DISPATCHER_AGENT_NAME,
    description: "Routes unassigned tasks to the most appropriate agent or user. Does not execute tasks.",
    workspace: path.join(env.CROW_SYSTEM_PATH, SYSTEM_AGENTS_PROJECT_DIR_NAME),
    persona,
    model: CLAUDE_MODELS.HAIKU,
    permissionMode: PERMISSION_MODE.DEFAULT,
    settingSources: [],
    availableTools: [],
    toolConfig: {
      mode: TOOL_MODE.RESTRICTED,
      tools: CROW_TASK_DISPATCHER_TOOLS,
      autoApprovedTools: CROW_TASK_DISPATCHER_TOOLS,
    },
    mcpServerIds: [],
    persistSession: false,
    excludeClaudeCodeSystemPrompt: true,
    isSystemAgent: true,
    isBackgroundAgent: true,
    createdAt: CROW_TASK_DISPATCHER_BIRTHDAY,
    updatedAt: CROW_TASK_DISPATCHER_BIRTHDAY,
  };
}
