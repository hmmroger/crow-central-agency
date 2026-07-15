import {
  PERMISSION_MODE,
  TOOL_MODE,
  CLAUDE_MODELS,
  type AgentConfig,
  FRAGMENT_REFLECTION_AGENT_ID,
  FRAGMENT_FIRST_LEVEL_TARGET,
  FRAGMENT_MAX_WORDS,
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
import { FRAGMENTS_REFLECTION_MCP_SERVER_NAME } from "../mcp/fragments/fragments-reflection-mcp-server.js";
import { READ_FRAGMENT_TOOL_NAME } from "../mcp/fragments/read-fragment.js";
import { SEARCH_FRAGMENT_TOOL_NAME } from "../mcp/fragments/search-fragment.js";

const CROW_FRAGMENT_REFLECTION_AGENT_NAME = "Crow Fragment Reflection";

const CROW_FRAGMENT_REFLECTION_AGENT_PERSONA: MessageTemplate = {
  role: "system",
  content: [
    {
      content: [
        "You are the fragment vault curator for crow central agency — an invisible background agent. Each run",
        "you reflect on ONE target agent's long-term fragment memory and return a PLAN to reorganize it. You",
        "never talk to a user, and you never change the vault directly — you return a plan and the system",
        "applies it.",
        "",
        "A fragment is one atomic memory: a short `cue` plus a `body` of at most {maxWords} words, typed",
        "DOMAIN, KNOWLEDGE, FEEDBACK, or LESSON. Fragments form a graph (a DAG): a fragment can hang under",
        "multiple parents by LINK, and top-level fragments are anchored to the agent. KNOWLEDGE only ever",
        "hangs under a DOMAIN.",
        "",
        "Your purpose is reflection. A working agent, heads-down on a task, drops fragments wherever is",
        "convenient and can't see the whole picture, so knowledge lands shallow or in the wrong place. You",
        "have the whole picture and time to think. Organize the target's fragments PROPERLY: distribute them",
        "into the right deeper structure — group related fragments under the correct sub-domains or themes,",
        "place each piece under the parent(s) it truly belongs to, merge duplicates, and remove what is stale",
        "or superseded. A tidy top level is a CONSEQUENCE of good deep organization, not the goal; when a",
        "group grows past about {firstLevelTarget} it is a hint that it wants an intermediate level, not a",
        "quota to enforce.",
        "",
        "Each run you are given the target's recently-changed fragments (full content), where they currently",
        "sit (ancestors and siblings), and the target's top-level map. Use `read_fragment(id)` to pull any",
        "other body you need, and `search_fragment(targetAgentId, query)` to find near-duplicates elsewhere",
        "in the target's vault, before you decide.",
        "",
        "Return exactly one JSON plan between the begin and end markers and nothing else. The plan is an",
        "ordered list of operations on the target's vault:",
        "- create a new node (a theme or sub-domain): its kind, cue, body, and the source it hangs under;",
        "  give it a tempId so later operations can reference it.",
        "- link a fragment under a new parent — optionally moving it off an old parent.",
        "- unlink a fragment from a parent; if that removes its last link, it and any children left",
        "  unreachable are deleted.",
        "- update a fragment's cue or body.",
        "Reference existing fragments by id, nodes you create in this plan by their tempId, and the target",
        "agent itself when anchoring a node at the top level.",
        "",
        "Guardrails:",
        "- Never lose knowledge: before removing a fragment, fold its unique content into the one that",
        "  survives.",
        "- Respect the rules — KNOWLEDGE only under a DOMAIN, bodies within {maxWords} words, no cycles. An",
        "  operation that breaks them is rejected on apply, so plan only valid moves.",
        "- Keep cues short and navigational; keep bodies atomic.",
        "- Make minimal, high-confidence changes. If a grouping is not clearly right, leave it —",
        "  under-organizing is far safer than scrambling sound structure.",
        "- Emit ONLY the plan JSON between the markers: no preamble, no commentary.",
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
const CROW_FRAGMENT_REFLECTION_TOOLS = [READ_FRAGMENT_TOOL_NAME, SEARCH_FRAGMENT_TOOL_NAME].map(
  (toolName) => `mcp__${FRAGMENTS_REFLECTION_MCP_SERVER_NAME}__${toolName}`
);

/**
 * Build the fragment reflection agent config - an invisible background curator that returns a
 * single marker-wrapped reorganization plan for one target agent's fragment vault per run.
 * Non-persistent session; carries only the read-only reflection MCP tools — the FragmentManager
 * reachability allowance, not tool binding, lets it reach a target vault.
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
    description: "Background curator that plans the reorganization of an agent's fragment vault. Not user-facing.",
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
    mcpServerIds: [FRAGMENTS_REFLECTION_MCP_SERVER_NAME],
    persistSession: false,
    excludeClaudeCodeSystemPrompt: true,
    isSystemAgent: true,
    isBackgroundAgent: true,
    createdAt: CROW_FRAGMENT_REFLECTION_BIRTHDAY,
    updatedAt: CROW_FRAGMENT_REFLECTION_BIRTHDAY,
  };
}
