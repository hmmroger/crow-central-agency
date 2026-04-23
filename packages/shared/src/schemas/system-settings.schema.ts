import { z } from "zod";
import { ConfiguredFeedSchema } from "./agent.schema.js";

/** Settings scoped to the Super Crow system agent. */
export const SuperCrowSettingsSchema = z.object({
  configuredFeeds: z.array(ConfiguredFeedSchema).default([]),
});

export type SuperCrowSettings = z.infer<typeof SuperCrowSettingsSchema>;

/** Partial update payload for super-crow settings. */
export const UpdateSuperCrowSettingsInputSchema = z.object({
  configuredFeeds: z.array(ConfiguredFeedSchema).optional(),
});

export type UpdateSuperCrowSettingsInput = z.infer<typeof UpdateSuperCrowSettingsInputSchema>;

/** Dashboard UX preferences — persisted user settings for the dashboard view. */
export const DashboardSettingsSchema = z.object({
  /**
   * Per-circle custom agent ordering. Key = circleId, value = agentId[] in
   * display order. Missing circles fall back to the backend-provided order.
   * Ids that no longer belong to the circle are ignored at render time.
   */
  circleAgentOrder: z.record(z.string(), z.array(z.string())).default({}),
  /**
   * Custom ordering of pinned agents on the dashboard. Ids no longer pinned
   * are ignored at render time; newly pinned agents append at the end.
   */
  pinnedAgentOrder: z.array(z.string()).default([]),
});

export type DashboardSettings = z.infer<typeof DashboardSettingsSchema>;

/** Partial update payload for dashboard settings. */
export const UpdateDashboardSettingsInputSchema = z.object({
  circleAgentOrder: z.record(z.string(), z.array(z.string())).optional(),
  pinnedAgentOrder: z.array(z.string()).optional(),
});

export type UpdateDashboardSettingsInput = z.infer<typeof UpdateDashboardSettingsInputSchema>;
