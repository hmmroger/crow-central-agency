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
export const GenerateRequestSchema = z.object({
  type: GenerationTypeSchema,
  prompt: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  currentPersona: z.string().optional(),
  currentAgentMd: z.string().optional(),
});

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
