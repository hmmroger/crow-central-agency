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
import { createMessageContentFromTemplate, getDefaultPromptContext } from "../utils/message-template.js";
import { SYSTEM_AGENTS_PROJECT_DIR_NAME } from "../config/constants.js";
import { CROW_FRAGMENT_REFLECTION_AGENT_PERSONA } from "../services/fragment/fragment-reflection-prompts.js";
import { FRAGMENTS_REFLECTION_MCP_SERVER_NAME } from "../mcp/fragments/fragments-reflection-mcp-server.js";
import { READ_FRAGMENT_TOOL_NAME } from "../mcp/fragments/read-fragment.js";
import { SEARCH_FRAGMENT_TOOL_NAME } from "../mcp/fragments/search-fragment.js";

const CROW_FRAGMENT_REFLECTION_AGENT_NAME = "Crow Fragment Reflection";

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
