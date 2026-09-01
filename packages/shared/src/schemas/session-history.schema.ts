import { z } from "zod";

/** Upper bound on a session label, shared by the rename request schema and the panel's input. */
export const SESSION_LABEL_MAX_LENGTH = 120;

/** Body of PATCH /api/agents/:id/sessions/:sessionId — the entry's new label. */
export const RenameSessionRequestSchema = z.object({
  label: z.string().trim().min(1).max(SESSION_LABEL_MAX_LENGTH),
});

/** One row of the pre-ordered session projection returned by GET /api/agents/:id/sessions. */
export const SessionHistoryNodeSchema = z.object({
  sessionId: z.string(),
  label: z.string(),
  lastUpdatedTimestamp: z.number(),
  /** 0 for a family root; one deeper per branch level */
  depth: z.number(),
  isBranch: z.boolean(),
});

export type RenameSessionRequest = z.infer<typeof RenameSessionRequestSchema>;
export type SessionHistoryNode = z.infer<typeof SessionHistoryNodeSchema>;
