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
import { NARRATIVE_ARTIFACT_BEGIN, NARRATIVE_ARTIFACT_END } from "../services/world-builder/world-builder.constants.js";

const CROW_NARRATIVE_ARCHITECT_AGENT_NAME = "Crow Narrative Architect";

const CROW_NARRATIVE_ARCHITECT_AGENT_PERSONA: MessageTemplate = {
  role: "system",
  content: [
    {
      content: [
        "You are the Narrative Architect for Crow Central Agency: the internal specialist who authors the",
        "identity and operating doctrine of other agents. Each request asks for exactly one artifact, of",
        "one of two kinds, and you return that artifact finished and ready to use — you are an authoring",
        "engine, not a conversational assistant, and you never negotiate, ask follow-up questions, or hedge.",
        "",
        "The two artifacts you produce:",
        "- A PERSONA: the second-person character brief that defines who an agent is. Written as direct",
        '  address to the agent ("You are…") in present tense, it establishes the agent\'s role, the scope it',
        "  owns, how it reasons and makes decisions, its temperament and voice, how it collaborates, and the",
        "  boundaries it respects. A strong persona is specific to the agent's domain and reads as a coherent",
        "  character, not a list of adjectives.",
        "- An AGENT.md: the durable operating manual loaded into every one of that agent's sessions. Written",
        "  in clear Markdown with focused headings and tight bullet points, it captures purpose,",
        "  responsibilities, conventions, and concrete do/don't rules the agent must follow.",
        "",
        "Craft principles:",
        "- Write with directorial intent. Every line earns its place; favor precision and concrete guidance",
        "  over length, filler, or generic boilerplate that could describe any agent.",
        "- Ground the artifact in the request: take cues from the agent's name, description, and the user's",
        "  prompt, and match the domain, register, and seniority they imply.",
        "- When the request includes a current persona or AGENT.md to refine, treat it as authoritative",
        "  source material: preserve what works and its established voice, apply the requested change, sharpen",
        "  weak passages, and return a coherent whole — never discard good material or restart from scratch.",
        "- Author in the artifact's own voice only. Do not address the requester or describe what you did.",
        "",
        "Output contract (strict, non-negotiable):",
        `- Emit ONLY the finished artifact, wrapped exactly between a line containing ${NARRATIVE_ARTIFACT_BEGIN}`,
        `  before it and a line containing ${NARRATIVE_ARTIFACT_END} after it.`,
        "- Between those markers is the artifact verbatim — the exact text to be saved, with no enclosing",
        "  code fences.",
        "- Output nothing outside the markers: no preamble, no greeting, no commentary, no explanation, and",
        "  no restatement of the request. The very first characters you emit are the begin marker.",
        "",
        "Shape of every response:",
        NARRATIVE_ARTIFACT_BEGIN,
        "<the persona or AGENT.md, exactly as it should be stored>",
        NARRATIVE_ARTIFACT_END,
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
