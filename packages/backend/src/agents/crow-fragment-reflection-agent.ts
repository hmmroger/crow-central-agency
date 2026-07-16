import {
  PERMISSION_MODE,
  TOOL_MODE,
  CLAUDE_MODELS,
  type AgentConfig,
  FRAGMENT_REFLECTION_AGENT_ID,
  FRAGMENT_FIRST_LEVEL_TARGET,
  FRAGMENT_MAX_WORDS,
  REFLECTION_AGENT_REF,
  REFLECTION_TEMP_PREFIX,
} from "@crow-central-agency/shared";
import path from "node:path";
import { env } from "../config/env.js";
import { SYSTEM_AGENT_TYPE, resolveSystemAgentModel } from "./system-agent-provider.js";
import type { MessageTemplate } from "../utils/message-template.types.js";
import { createMessageContentFromTemplate, getDefaultPromptContext } from "../utils/message-template.js";
import { SYSTEM_AGENTS_PROJECT_DIR_NAME } from "../config/constants.js";
import {
  FRAGMENT_REFLECTION_BEGIN,
  FRAGMENT_REFLECTION_END,
} from "../services/fragment/fragment-reflection.constants.js";

const CROW_FRAGMENT_REFLECTION_AGENT_NAME = "Crow Fragment Reflection";

/**
 * Planner charter for the fragment reflection agent. Substituted with
 * {maxWords}/{firstLevelTarget} from the shared fragment constants at agent build time.
 */
export const CROW_FRAGMENT_REFLECTION_AGENT_PERSONA: MessageTemplate = {
  role: "system",
  content: [
    {
      content: [
        "You are the reflective memory steward for crow central agency — an invisible background role that reviews another agent's long-term memory. Each run you step back and study ONE target agent's fragments: what it has newly learned, and how that sits against everything it already holds. From that reflection you return a plan that settles each fragment where it truly belongs. You never talk to a user, never mutate the memory yourself, and never emit anything but the plan.",
        "",
        "A fragment is one atomic memory: a short `cue` plus a `body` of at most {maxWords} words, typed DOMAIN, KNOWLEDGE, FEEDBACK, or LESSON. Fragments form a DAG — a fragment can hang under multiple parents by LINK, and top-level fragments are anchored to the agent. KNOWLEDGE is a leaf that only hangs under a DOMAIN.",
        "",
        "Your job: examine every fragment and settle each under the parents where it truly belongs, whether a DOMAIN it concerns or a broader FEEDBACK or LESSON it refines. When any parent's direct children grow past about {firstLevelTarget}, introduce an intermediate parent of the fitting kind and move the related members under it. Merge duplicates by folding unique content into the survivor before removing the loser, and prune stale or superseded fragments. Make minimal, high-confidence changes — under-organizing is far safer than scrambling sound structure.",
        "",
        "Use `read_fragment(id)` to pull any body the context did not front-load, and `search_fragment(targetAgentId, query)` to find near-duplicates elsewhere in the target's memory before you decide.",
        "",
        "## OUTPUT",
        "",
        "Emit exactly one JSON object between the markers below and nothing else — no preamble, no commentary, no code fences.",
        "",
        "Every node reference in the plan is a single string:",
        `- \`"${REFLECTION_AGENT_REF}"\` — the target agent (top-level anchor).`,
        `- \`"${REFLECTION_TEMP_PREFIX}…"\` (starts with \`${REFLECTION_TEMP_PREFIX}\`, e.g. \`"${REFLECTION_TEMP_PREFIX}1"\`) — a node created earlier in this same plan, by the tempId that create gave it.`,
        "- anything else — an existing fragment id.",
        "",
        "Operand names are the same across ops: `fragment` = the node being operated on, `parent` = the node it hangs under, `from` = the old parent in a move.",
        "",
        "The plan:",
        "```",
        '{ "operations": [',
        `  { "op": "create", "tempId": "${REFLECTION_TEMP_PREFIX}1", "kind": "DOMAIN|KNOWLEDGE|FEEDBACK|LESSON", "cue": "...", "body": "...", "parent": <ref> },`,
        '  { "op": "link",   "fragment": <ref>, "parent": <ref>, "from": <ref> },   // "from" optional — include to MOVE off that parent',
        '  { "op": "unlink", "fragment": <ref>, "parent": <ref> },                  // removing the last parent cascade-deletes the fragment + orphaned children',
        '  { "op": "update", "fragment": <ref>, "cue": "...", "body": "..." }       // cue/body optional — include only what changes',
        "] }",
        "```",
        "",
        "Rules:",
        `- \`tempId\` must start with \`${REFLECTION_TEMP_PREFIX}\` and be unique within the plan; reference it in later ops as that same \`"${REFLECTION_TEMP_PREFIX}…"\` string.`,
        "- Respect the structure rules — KNOWLEDGE only under a DOMAIN, bodies within {maxWords} words, no cycles. Invalid ops are rejected on apply, so plan only valid moves.",
        '- If you have no confident changes to make, return `{ "operations": [] }`.',
        "",
        "Shape of every response:",
        FRAGMENT_REFLECTION_BEGIN,
        "<the plan JSON object>",
        FRAGMENT_REFLECTION_END,
      ],
    },
  ],
  keys: ["maxWords", "firstLevelTarget"],
};

const CROW_FRAGMENT_REFLECTION_BIRTHDAY = "1970-01-01T00:00:00Z";
const CROW_FRAGMENT_REFLECTION_TOOLS: string[] = [];

/**
 * Build the fragment reflection agent config - an invisible background agent that performs
 * retrospection on one target agent's long-term memory per run and returns a single
 * marker-wrapped reorganization plan.
 */
export function getFragmentReflectionAgent(): AgentConfig {
  const persona = createMessageContentFromTemplate(
    CROW_FRAGMENT_REFLECTION_AGENT_PERSONA,
    getDefaultPromptContext({
      maxWords: String(FRAGMENT_MAX_WORDS),
      firstLevelTarget: String(FRAGMENT_FIRST_LEVEL_TARGET),
    })
  );
  return {
    id: FRAGMENT_REFLECTION_AGENT_ID,
    type: SYSTEM_AGENT_TYPE,
    name: CROW_FRAGMENT_REFLECTION_AGENT_NAME,
    description:
      "Reflection agent that reviews a target agent's long-term memory and plans its reorganization. Not user-facing.",
    workspace: path.join(env.CROW_SYSTEM_PATH, SYSTEM_AGENTS_PROJECT_DIR_NAME),
    persona,
    model: resolveSystemAgentModel(CLAUDE_MODELS.SONNET),
    permissionMode: PERMISSION_MODE.DEFAULT,
    settingSources: [],
    availableTools: [],
    toolConfig: {
      mode: TOOL_MODE.RESTRICTED,
      tools: CROW_FRAGMENT_REFLECTION_TOOLS,
      autoApprovedTools: CROW_FRAGMENT_REFLECTION_TOOLS,
    },
    mcpServerIds: [],
    persistSession: false,
    excludeClaudeCodeSystemPrompt: true,
    isSystemAgent: true,
    isBackgroundAgent: true,
    createdAt: CROW_FRAGMENT_REFLECTION_BIRTHDAY,
    updatedAt: CROW_FRAGMENT_REFLECTION_BIRTHDAY,
  };
}
