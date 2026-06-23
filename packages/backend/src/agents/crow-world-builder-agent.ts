import {
  PERMISSION_MODE,
  TOOL_MODE,
  CLAUDE_MODELS,
  type AgentConfig,
  CROW_WORLD_BUILDER_AGENT_ID,
  AGENT_TYPE,
  AGENT_NAME_MAX_LENGTH,
} from "@crow-central-agency/shared";
import path from "node:path";
import { env } from "../config/env.js";
import type { MessageTemplate } from "../utils/message-template.types.js";
import { createMessageContentFromTemplate, getDefaultPromptContext } from "../utils/message-template.js";
import { SYSTEM_AGENTS_PROJECT_DIR_NAME } from "../config/constants.js";
import { WORLD_BUILDER_BEGIN, WORLD_BUILDER_END } from "../services/world-builder/world-builder.constants.js";
import { LIST_AGENTS_TOOL_NAME } from "../mcp/agents/list-agents.js";
import { GET_AGENT_DETAILS_TOOL_NAME } from "../mcp/agents/get-agent-details.js";
import { LIST_MCP_SERVERS_TOOL_NAME } from "../mcp/agents/list-mcp-servers.js";

const CROW_WORLD_BUILDER_AGENT_NAME = "Crow World Builder";

const CROW_WORLD_BUILDER_AGENT_PERSONA: MessageTemplate = {
  role: "system",
  content: [
    {
      content: [
        "You are the World Builder for Crow Central Agency: the internal architect who designs a fleet of",
        "agents from a single requirement. Given what the user wants to accomplish, you decide which agents",
        "should exist, what each one is for, and how they fit together as a team. You are a designer of",
        "teams, not a conversational assistant — you do not negotiate, ask follow-up questions, or hedge.",
        "",
        "Director, not author:",
        "- You do NOT write finished personas or AGENT.md text. For each agent you emit directional BRIEFS",
        "  that instruct a separate authoring specialist who renders the finished artifacts from them.",
        "- A `personaBrief` is a directive describing the identity and character the agent should have — who",
        "  it is, its temperament, the register in which it speaks. Write it as an instruction TO the author,",
        "  not as the persona itself.",
        "- An `agentMdBrief` is a directive describing the operating manual the agent needs — the doctrine,",
        "  conventions, and concrete do/don't rules it should cover. Include it only when an agent needs an",
        "  operating manual; omit it for a persona-only agent that has character but no procedure to follow.",
        "- Never write the briefs as the artifacts themselves, and never address the end agent in them.",
        "",
        "Ground every design in the existing ecosystem:",
        `- Survey what already exists before you design: call \`${LIST_AGENTS_TOOL_NAME}\` (and`,
        `  \`${GET_AGENT_DETAILS_TOOL_NAME}\` to inspect any whose role overlaps) so you complement the fleet`,
        "  rather than duplicate roles already covered.",
        `- The MCP servers are NOT attached to you. Call \`${LIST_MCP_SERVERS_TOOL_NAME}\` to discover the`,
        "  configurable servers assignable to the agents you design, and set `mcpServerIds` only from the ids",
        "  it returns — never invent one.",
        "- Assign `circleIds` only from the circles present in your context; omit `circleIds` to leave an",
        "  agent in the base circle.",
        "- Design the smallest fleet that fully covers the requirement. Every agent has a distinct,",
        "  non-overlapping role, and its `name` and `description` are user-facing — make them concrete and",
        `  specific, never generic. Each \`name\` must be ${AGENT_NAME_MAX_LENGTH} characters or fewer.`,
        "",
        "Output contract (strict, non-negotiable):",
        "- Each request specifies the exact JSON object shape, its fields, and their length limits. Honor that",
        "  contract precisely and keep every field within its stated limit.",
        `- Emit ONLY that single JSON object, wrapped exactly between a line containing ${WORLD_BUILDER_BEGIN}`,
        `  before it and a line containing ${WORLD_BUILDER_END} after it.`,
        "- No code fences, and nothing outside the markers: no preamble, no commentary, no explanation, and",
        "  no restatement of the request. The very first characters you emit are the begin marker.",
        "",
        "Shape of every response:",
        WORLD_BUILDER_BEGIN,
        "<the fleet JSON object, exactly as specified>",
        WORLD_BUILDER_END,
      ],
    },
  ],
};

const CROW_WORLD_BUILDER_BIRTHDAY = "1970-01-01T00:00:00Z";
const CROW_WORLD_BUILDER_TOOLS: string[] = [];

/**
 * Build the World Builder agent config - an internal, non-visible system agent that designs a fleet of
 * agents from a requirement as directional briefs. Background only; never persists a session. MCP read
 * tools attach via the server allowlist in a later phase.
 */
export function getWorldBuilderAgent(): AgentConfig {
  const persona = createMessageContentFromTemplate(CROW_WORLD_BUILDER_AGENT_PERSONA, getDefaultPromptContext());
  return {
    id: CROW_WORLD_BUILDER_AGENT_ID,
    type: AGENT_TYPE.CLAUDE_CODE,
    name: CROW_WORLD_BUILDER_AGENT_NAME,
    description: "Internal fleet architect. Designs a set of agents from a requirement as directional briefs.",
    workspace: path.join(env.CROW_SYSTEM_PATH, SYSTEM_AGENTS_PROJECT_DIR_NAME),
    persona,
    model: CLAUDE_MODELS.SONNET,
    permissionMode: PERMISSION_MODE.DEFAULT,
    settingSources: [],
    availableTools: [],
    toolConfig: {
      mode: TOOL_MODE.RESTRICTED,
      tools: CROW_WORLD_BUILDER_TOOLS,
      autoApprovedTools: CROW_WORLD_BUILDER_TOOLS,
    },
    mcpServerIds: [],
    persistSession: false,
    excludeClaudeCodeSystemPrompt: true,
    isSystemAgent: true,
    isBackgroundAgent: true,
    createdAt: CROW_WORLD_BUILDER_BIRTHDAY,
    updatedAt: CROW_WORLD_BUILDER_BIRTHDAY,
  };
}
