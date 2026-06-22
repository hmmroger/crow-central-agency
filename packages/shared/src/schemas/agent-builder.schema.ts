import { z } from "zod";

/**
 * Upper bounds for the World Builder fleet contract. Names/descriptions mirror the generation
 * endpoint bounds; briefs are bounded like a prompt since they direct the Narrative Architect.
 */
export const AGENT_BUILDER_LIMITS = {
  NAME: 200,
  DESCRIPTION: 2000,
  PERSONA_BRIEF: 4000,
  AGENT_MD_BRIEF: 4000,
  PROJECT_PATH: 1000,
} as const;

/**
 * A single agent designed by the World Builder. The World Builder is a director: it emits
 * directional briefs, not authored text — a later phase fans the briefs out to the Narrative
 * Architect to author the real persona/AGENT.md.
 */
export const FleetAgentSchema = z.object({
  name: z.string().min(1).max(AGENT_BUILDER_LIMITS.NAME),
  description: z.string().min(1).max(AGENT_BUILDER_LIMITS.DESCRIPTION),
  /** Directional prompt for the Narrative Architect's PERSONA generation. */
  personaBrief: z.string().min(1).max(AGENT_BUILDER_LIMITS.PERSONA_BRIEF),
  /** Directional prompt for the Narrative Architect's AGENT_MD generation; omit = persona-only agent. */
  agentMdBrief: z.string().min(1).max(AGENT_BUILDER_LIMITS.AGENT_MD_BRIEF).optional(),
  mcpServerIds: z.array(z.string()).optional(),
  circleIds: z.array(z.string()).optional(),
});

export type FleetAgent = z.infer<typeof FleetAgentSchema>;

/** The World Builder's JSON output contract. Agent count is `agents.length`. */
export const FleetResponseSchema = z.object({
  scenario: z.literal("fleet"),
  agents: z.array(FleetAgentSchema).min(1),
});

export type FleetResponse = z.infer<typeof FleetResponseSchema>;

/**
 * The single active draft: a user-config layer (project path) over the World Builder-designed
 * agents. `projectPath` maps to each agent's workspace at build time (whole-fleet).
 */
export const AgentBuilderDraftSchema = z.object({
  projectPath: z.string().min(1).max(AGENT_BUILDER_LIMITS.PROJECT_PATH).optional(),
  agents: z.array(FleetAgentSchema),
});

export type AgentBuilderDraft = z.infer<typeof AgentBuilderDraftSchema>;
