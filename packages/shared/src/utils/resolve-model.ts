import { CLAUDE_MODELS, type AgentModels } from "../schemas/agent.schema.js";

/**
 * Maps retired model IDs to their successor.
 */
export const MODEL_ALIASES: Record<string, AgentModels> = {
  [CLAUDE_MODELS.SONNET_4_5]: CLAUDE_MODELS.SONNET,
  [CLAUDE_MODELS.OPUS_4_5]: CLAUDE_MODELS.OPUS,
  [CLAUDE_MODELS.OPUS_4_6]: CLAUDE_MODELS.OPUS,
};

/** Resolve a potentially retired model ID to its current successor. */
export function resolveModel(model: string): string {
  return MODEL_ALIASES[model] ?? model;
}
