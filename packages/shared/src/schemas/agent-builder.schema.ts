import { z } from "zod";
import { AGENT_NAME_MAX_LENGTH, AgentTypeSchema } from "./agent.schema.js";

export const AgentBuilderBuiltAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type AgentBuilderBuiltAgent = z.infer<typeof AgentBuilderBuiltAgentSchema>;

/**
 * Outcome of a best-effort fleet build: agents that were created and agents that failed. A
 * backend-produced response type, not a request contract. On full success the draft goes COMPLETED;
 * on partial failure the failed agents stay so the build can be retried.
 */
export const AgentBuilderBuildResultSchema = z.object({
  created: z.array(AgentBuilderBuiltAgentSchema),
  failed: z.array(z.object({ name: z.string(), error: z.string() })),
});

export type AgentBuilderBuildResult = z.infer<typeof AgentBuilderBuildResultSchema>;

/**
 * Lifecycle of the single active draft.
 */
export const AGENT_BUILDER_DRAFT_STATUS = {
  READY: "ready",
  BUILDING: "building",
  COMPLETED: "completed",
} as const;

export type AgentBuilderDraftStatus = (typeof AGENT_BUILDER_DRAFT_STATUS)[keyof typeof AGENT_BUILDER_DRAFT_STATUS];

export const AgentBuilderDraftStatusSchema = z.enum([
  AGENT_BUILDER_DRAFT_STATUS.READY,
  AGENT_BUILDER_DRAFT_STATUS.BUILDING,
  AGENT_BUILDER_DRAFT_STATUS.COMPLETED,
]);

/**
 * Word budgets the World Builder is asked to stay within.
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
 * A single agent designed by the World Builder.
 */
export const FleetAgentSchema = z.object({
  name: z.string().min(1).max(AGENT_BUILDER_LIMITS.NAME),
  description: z.string().min(1).max(AGENT_BUILDER_LIMITS.DESCRIPTION),
  personaBrief: z.string().min(1).max(AGENT_BUILDER_LIMITS.PERSONA_BRIEF),
  agentMdBrief: z.string().min(1).max(AGENT_BUILDER_LIMITS.AGENT_MD_BRIEF).optional(),
  mcpServerIds: z.array(z.string().min(1)).optional(),
  circleIds: z.array(z.string().min(1)).optional(),
});

export type FleetAgent = z.infer<typeof FleetAgentSchema>;

/** The World Builder's JSON output */
export const FleetResponseSchema = z.object({
  agents: z.array(FleetAgentSchema),
  existingAgents: z.array(AgentBuilderBuiltAgentSchema).optional(),
});

export type FleetResponse = z.infer<typeof FleetResponseSchema>;

export const AgentBuilderDraftSchema = z.object({
  projectPath: z.string().min(1).max(AGENT_BUILDER_LIMITS.PROJECT_PATH).optional(),
  agentType: AgentTypeSchema.optional(),
  status: AgentBuilderDraftStatusSchema.default(AGENT_BUILDER_DRAFT_STATUS.READY),
  lastBuildResult: AgentBuilderBuildResultSchema.optional(),
  existingAgents: z.array(AgentBuilderBuiltAgentSchema).optional(),
  builtAgents: z.array(AgentBuilderBuiltAgentSchema).optional(),
  agents: z.array(FleetAgentSchema),
});

export type AgentBuilderDraft = z.infer<typeof AgentBuilderDraftSchema>;

export const AgentBuilderDesignRequestSchema = z.object({
  input: z.string().min(1).max(AGENT_BUILDER_LIMITS.INPUT),
});

export type AgentBuilderDesignRequest = z.infer<typeof AgentBuilderDesignRequestSchema>;

export const AgentBuilderPatchRequestSchema = z.object({
  projectPath: z.string().max(AGENT_BUILDER_LIMITS.PROJECT_PATH).optional(),
  agentType: AgentTypeSchema.optional(),
});

export type AgentBuilderPatchRequest = z.infer<typeof AgentBuilderPatchRequestSchema>;

export const FleetNamedRefSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type FleetNamedRef = z.infer<typeof FleetNamedRefSchema>;

export const FleetAgentViewSchema = z.object({
  name: z.string(),
  description: z.string(),
  personaBrief: z.string(),
  agentMdBrief: z.string().optional(),
  mcpServers: z.array(FleetNamedRefSchema),
  circles: z.array(FleetNamedRefSchema),
});

export type FleetAgentView = z.infer<typeof FleetAgentViewSchema>;

/**
 * The active draft prepared for display: a resolved view of {@link AgentBuilderDraft} whose agents
 * carry friendly names instead of raw ids, plus the lifecycle `status` and the most recent
 * `lastBuildResult`. Backend-produced response type, not a request contract.
 */
export const AgentBuilderDraftViewSchema = z.object({
  projectPath: z.string().optional(),
  agentType: AgentTypeSchema.optional(),
  status: AgentBuilderDraftStatusSchema,
  lastBuildResult: AgentBuilderBuildResultSchema.optional(),
  existingAgents: z.array(AgentBuilderBuiltAgentSchema).optional(),
  builtAgents: z.array(AgentBuilderBuiltAgentSchema).optional(),
  agents: z.array(FleetAgentViewSchema),
});

export type AgentBuilderDraftView = z.infer<typeof AgentBuilderDraftViewSchema>;

/** Response from `GET /api/agent-builder/draft` — the active draft, or null when none exists. */
export const AgentBuilderDraftResponseSchema = z.object({
  draft: AgentBuilderDraftViewSchema.nullable(),
});

export type AgentBuilderDraftResponse = z.infer<typeof AgentBuilderDraftResponseSchema>;

/** Response from the design and fleet-config endpoints — the updated draft (always present). */
export const AgentBuilderDraftMutationResponseSchema = z.object({
  draft: AgentBuilderDraftViewSchema,
});

export type AgentBuilderDraftMutationResponse = z.infer<typeof AgentBuilderDraftMutationResponseSchema>;
