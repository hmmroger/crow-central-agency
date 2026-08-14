import { z } from "zod";

/** One row of the pre-ordered session projection returned by GET /api/agents/:id/sessions. */
export const SessionHistoryNodeSchema = z.object({
  sessionId: z.string(),
  label: z.string(),
  lastUpdatedTimestamp: z.number(),
  /** 0 for a family root; one deeper per branch level */
  depth: z.number(),
  isBranch: z.boolean(),
});

export type SessionHistoryNode = z.infer<typeof SessionHistoryNodeSchema>;
