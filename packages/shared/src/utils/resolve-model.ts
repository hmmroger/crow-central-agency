import { CLAUDE_MODELS, type CaludeModel, type GitHubCopilotModel } from "../schemas/agent.schema.js";

/**
 * Maps retired model IDs to their successor.
 */
export const MODEL_ALIASES: Record<string, CaludeModel> = {
  [CLAUDE_MODELS.SONNET_4_5]: CLAUDE_MODELS.SONNET,
  [CLAUDE_MODELS.OPUS_4_5]: CLAUDE_MODELS.OPUS,
  [CLAUDE_MODELS.OPUS_4_6]: CLAUDE_MODELS.OPUS,
};

export const COPILOT_MODEL_ALIASES: Record<string, GitHubCopilotModel> = {};

/** Resolve a potentially retired model ID to its current successor. */
export function resolveModel(model: string): string {
  return MODEL_ALIASES[model] ?? COPILOT_MODEL_ALIASES[model] ?? model;
}
