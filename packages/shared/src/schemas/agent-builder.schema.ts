import { z } from "zod";
import { AGENT_NAME_MAX_LENGTH, AgentTypeSchema, type AgentType } from "./agent.schema.js";

/**
 * Outcome of a best-effort fleet build: agents that were created and agents that failed. A
 * backend-produced response type, not a request contract. Succeeded agents leave the draft; failed
 * agents stay so the build can be retried.
 */
export interface AgentBuilderBuildResult {
  created: { id: string; name: string }[];
  failed: { name: string; error: string }[];
}

/**
 * Word budgets the World Builder is asked to stay within. Word counts are what the prompt communicates
 * and what the model actually controls. They guide the design; {@link AGENT_BUILDER_LIMITS} caps the
 * stored values generously so a budget-respecting design never trips schema validation.
 */
export const AGENT_BUILDER_WORD_BUDGET = {
  DESCRIPTION: 30,
  PERSONA_BRIEF: 50,
  AGENT_MD_BRIEF: 150,
} as const;

export const AGENT_BUILDER_LIMITS = {
  NAME: AGENT_NAME_MAX_LENGTH,
  DESCRIPTION: 400,
  PERSONA_BRIEF: 600,
  AGENT_MD_BRIEF: 2000,
  PROJECT_PATH: 1000,
  INPUT: 4000,
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
  mcpServerIds: z.array(z.string().min(1)).optional(),
  circleIds: z.array(z.string().min(1)).optional(),
});

export type FleetAgent = z.infer<typeof FleetAgentSchema>;

/** The World Builder's JSON output contract. Agent count is `agents.length`. */
export const FleetResponseSchema = z.object({
  agents: z.array(FleetAgentSchema).min(1),
});

export type FleetResponse = z.infer<typeof FleetResponseSchema>;

/**
 * The single active draft: a user-config layer (project path) over the World Builder-designed
 * agents. `projectPath` maps to each agent's workspace at build time (whole-fleet).
 */
export const AgentBuilderDraftSchema = z.object({
  projectPath: z.string().min(1).max(AGENT_BUILDER_LIMITS.PROJECT_PATH).optional(),
  /** Agent type applied to the whole fleet at build time; omitted = the create-path default. */
  agentType: AgentTypeSchema.optional(),
  // Empty agents is valid: a draft can hold a projectPath before the World Builder has produced a fleet.
  agents: z.array(FleetAgentSchema),
});

export type AgentBuilderDraft = z.infer<typeof AgentBuilderDraftSchema>;

/** A design request: the user's zero-state requirement or a refinement directive (same field). */
export const AgentBuilderDesignRequestSchema = z.object({
  input: z.string().min(1).max(AGENT_BUILDER_LIMITS.INPUT),
});

export type AgentBuilderDesignRequest = z.infer<typeof AgentBuilderDesignRequestSchema>;

/** A draft patch. An empty/omitted projectPath clears the path; the service normalizes whitespace to undefined. */
export const AgentBuilderPatchRequestSchema = z.object({
  projectPath: z.string().max(AGENT_BUILDER_LIMITS.PROJECT_PATH).optional(),
  agentType: AgentTypeSchema.optional(),
});

export type AgentBuilderPatchRequest = z.infer<typeof AgentBuilderPatchRequestSchema>;

/** An id resolved to its display name for the UI — users see names, never raw ids. */
export interface FleetNamedRef {
  id: string;
  name: string;
}

/**
 * A fleet agent prepared for display: the raw `mcpServerIds`/`circleIds` of {@link FleetAgent} resolved
 * to named refs. This is the frontend-facing shape; the stored {@link FleetAgent} keeps the ids.
 */
export interface FleetAgentView {
  name: string;
  description: string;
  personaBrief: string;
  agentMdBrief?: string;
  mcpServers: FleetNamedRef[];
  circles: FleetNamedRef[];
}

/**
 * The active draft prepared for display: a resolved view of {@link AgentBuilderDraft} whose agents
 * carry friendly names instead of raw ids. Backend-produced response type, not a request contract.
 */
export interface AgentBuilderDraftView {
  projectPath?: string;
  agentType?: AgentType;
  agents: FleetAgentView[];
}
