import { z } from "zod";

/** Kind of artifact the Narrative Architect produces. Doubles as the requested operation. */
export const GENERATION_TYPE = {
  PERSONA: "persona",
  AGENT_MD: "agentmd",
} as const;

export type GenerationType = (typeof GENERATION_TYPE)[keyof typeof GENERATION_TYPE];

export const GenerationTypeSchema = z.enum([GENERATION_TYPE.PERSONA, GENERATION_TYPE.AGENT_MD]);

/**
 * Structured generation request. `type` selects persona vs AGENT.md; the optional hints describe the
 * agent being authored. Presence of `currentPersona` / `currentAgentMd` switches the operation from
 * author/generate to refine/reinforce.
 */
/** Upper bounds keep the always-reachable generation endpoint from driving unbounded token usage. */
export const GENERATION_LIMITS = {
  PROMPT: 4000,
  NAME: 200,
  DESCRIPTION: 2000,
  PERSONA: 20000,
  AGENT_MD: 50000,
} as const;

export const GenerateRequestSchema = z.object({
  type: GenerationTypeSchema,
  prompt: z.string().min(1).max(GENERATION_LIMITS.PROMPT),
  name: z.string().max(GENERATION_LIMITS.NAME).optional(),
  description: z.string().max(GENERATION_LIMITS.DESCRIPTION).optional(),
  currentPersona: z.string().max(GENERATION_LIMITS.PERSONA).optional(),
  currentAgentMd: z.string().max(GENERATION_LIMITS.AGENT_MD).optional(),
});

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
