import { z } from "zod";

/**
 * One row of the session history projection returned by GET /api/agents/:id/sessions.
 *
 * The list is pre-ordered and carries `depth` rather than nesting, so the panel indents and
 * renders without computing anything. Which session is current is deliberately absent: that is
 * runtime state, which already publishes it, and duplicating it here would put one fact on two
 * channels that can disagree.
 */
export const SessionHistoryNodeSchema = z.object({
  sessionId: z.string(),
  label: z.string(),
  lastUpdatedTimestamp: z.number(),
  /** 0 for a family root; one deeper per branch level */
  depth: z.number(),
  /** The entry was created by branching off another session */
  isBranch: z.boolean(),
});

export type SessionHistoryNode = z.infer<typeof SessionHistoryNodeSchema>;
