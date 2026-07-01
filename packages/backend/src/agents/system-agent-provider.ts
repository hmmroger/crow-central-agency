import { AGENT_TYPE, GITHUB_COPILOT_MODELS, type AgentType } from "@crow-central-agency/shared";
import { env } from "../config/env.js";

/** Accepted CROW_SYSTEM_AGENT_PROVIDER values. */
const SYSTEM_AGENT_PROVIDER = {
  CLAUDE: "claude",
  COPILOT: "copilot",
} as const;

/**
 * Provider backing the built-in system agents, controlled by CROW_SYSTEM_AGENT_PROVIDER
 * (claude | copilot), defaulting to Claude Code. Forced back to Claude Code when
 * DISABLE_GITHUB_COPILOT is set, so system agents never point at a runtime that never starts.
 */
export const SYSTEM_AGENT_TYPE: AgentType =
  !env.DISABLE_GITHUB_COPILOT && env.CROW_SYSTEM_AGENT_PROVIDER === SYSTEM_AGENT_PROVIDER.COPILOT
    ? AGENT_TYPE.GITHUB_COPILOT
    : AGENT_TYPE.CLAUDE_CODE;

/**
 * Resolve the model a system agent runs on for the active provider. Claude Code keeps the agent's
 * per-tier Claude model; Copilot defaults every system agent to `auto`, overridable in one place via
 * CROW_SYSTEM_AGENT_COPILOT_MODEL.
 */
export function resolveSystemAgentModel(claudeModel: string): string {
  return SYSTEM_AGENT_TYPE === AGENT_TYPE.GITHUB_COPILOT
    ? (env.CROW_SYSTEM_AGENT_COPILOT_MODEL ?? GITHUB_COPILOT_MODELS.AUTO)
    : claudeModel;
}
