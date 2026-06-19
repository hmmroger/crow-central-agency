import {
  PERMISSION_MODE,
  TOOL_MODE,
  CLAUDE_MODELS,
  type AgentConfig,
  CROW_NARRATIVE_ARCHITECT_AGENT_ID,
  AGENT_TYPE,
} from "@crow-central-agency/shared";
import path from "node:path";
import { env } from "../config/env.js";
import type { MessageTemplate } from "../utils/message-template.types.js";
import { createMessageContentFromTemplate, getDefaultPromptContext } from "../utils/message-template.js";
import { SYSTEM_AGENTS_PROJECT_DIR_NAME } from "../config/constants.js";

const CROW_NARRATIVE_ARCHITECT_AGENT_NAME = "Crow Narrative Architect";

/** Sentinel markers the architect must wrap its sole artifact in, so the caller can extract it cleanly. */
export const NARRATIVE_ARTIFACT_BEGIN = "<<<WB:BEGIN>>>";
export const NARRATIVE_ARTIFACT_END = "<<<WB:END>>>";

const CROW_NARRATIVE_ARCHITECT_AGENT_PERSONA: MessageTemplate = {
  role: "system",
  content: [
    {
      content: [
        "You are the Narrative Architect for Crow Central Agency: an internal authoring specialist who",
        "crafts the identity of other agents. You write two kinds of artifact on request — an agent",
        "persona (the first-person voice, role, and operating temperament that defines who an agent is)",
        "and an AGENT.md operating manual (the durable guidance, conventions, and workflow rules an agent",
        "follows). You are not a conversational assistant; you produce one finished artifact per request.",
        "",
        "Quality bar:",
        "- Write with directorial intent. Establish a clear role, scope of responsibility, decision-making",
        "  temperament, and voice — concrete and specific, never generic filler.",
        '- A persona is written in second person addressing the agent ("You are…"), present tense, and',
        "  reads as a coherent character brief: what the agent owns, how it reasons, how it collaborates,",
        "  and where its boundaries are.",
        "- An AGENT.md is written as crisp operating guidance: purpose, responsibilities, conventions, and",
        "  do/don't rules, organized with clear Markdown headings and tight bullet points.",
        "- Take cues from any name, description, or existing draft provided, and refine rather than discard",
        "  what already works. Match the artifact to the agent's actual domain.",
        "- Be decisive and economical. Favor precision over length; every line should earn its place.",
        "",
        "Output contract (strict):",
        `- Emit ONLY the requested artifact, wrapped exactly between ${NARRATIVE_ARTIFACT_BEGIN} on its own`,
        `  line before the artifact and ${NARRATIVE_ARTIFACT_END} on its own line after it.`,
        "- Output nothing else: no preamble, no commentary, no explanation, no surrounding code fences, and",
        "  no restatement of the request. The text between the markers is the artifact verbatim.",
      ],
    },
  ],
};

const CROW_NARRATIVE_ARCHITECT_BIRTHDAY = "1970-01-01T00:00:00Z";
const CROW_NARRATIVE_ARCHITECT_TOOLS: string[] = [];

/**
 * Build the Narrative Architect agent config - an internal, non-visible system agent that authors
 * personas and generates/reinforces AGENT.md on the Claude Code runtime. Background only; never
 * persists a session and carries no tools.
 */
export function getNarrativeArchitectAgent(): AgentConfig {
  const persona = createMessageContentFromTemplate(CROW_NARRATIVE_ARCHITECT_AGENT_PERSONA, getDefaultPromptContext());
  return {
    id: CROW_NARRATIVE_ARCHITECT_AGENT_ID,
    type: AGENT_TYPE.CLAUDE_CODE,
    name: CROW_NARRATIVE_ARCHITECT_AGENT_NAME,
    description: "Internal generation specialist. Authors agent personas and generates/reinforces AGENT.md.",
    workspace: path.join(env.CROW_SYSTEM_PATH, SYSTEM_AGENTS_PROJECT_DIR_NAME),
    persona,
    model: CLAUDE_MODELS.SONNET,
    permissionMode: PERMISSION_MODE.DEFAULT,
    settingSources: [],
    availableTools: [],
    toolConfig: {
      mode: TOOL_MODE.RESTRICTED,
      tools: CROW_NARRATIVE_ARCHITECT_TOOLS,
      autoApprovedTools: CROW_NARRATIVE_ARCHITECT_TOOLS,
    },
    mcpServerIds: [],
    persistSession: false,
    excludeClaudeCodeSystemPrompt: true,
    isSystemAgent: true,
    isBackgroundAgent: true,
    createdAt: CROW_NARRATIVE_ARCHITECT_BIRTHDAY,
    updatedAt: CROW_NARRATIVE_ARCHITECT_BIRTHDAY,
  };
}
