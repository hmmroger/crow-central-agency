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

const CROW_FRAGMENT_REFLECTION_AGENT_NAME = "Crow Fragment Reflection";

const CROW_FRAGMENT_REFLECTION_BIRTHDAY = "1970-01-01T00:00:00Z";
const CROW_FRAGMENT_REFLECTION_TOOLS: string[] = [];

/**
 * Build the fragment reflection agent config - an invisible background curator that returns a
 * single marker-wrapped reorganization plan for one target agent's fragment vault per run.
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
    mcpServerIds: [],
    persistSession: false,
    excludeClaudeCodeSystemPrompt: true,
    isSystemAgent: true,
    isBackgroundAgent: true,
    createdAt: CROW_FRAGMENT_REFLECTION_BIRTHDAY,
    updatedAt: CROW_FRAGMENT_REFLECTION_BIRTHDAY,
  };
}
