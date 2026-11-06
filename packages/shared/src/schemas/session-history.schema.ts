import { z } from "zod";

/** Upper bound on a session label, shared by the rename request schema and the panel's input. */
export const SESSION_LABEL_MAX_LENGTH = 120;

/** A session label as a user or a setting names it: trimmed and bounded. */
export const SessionLabelSchema = z.string().trim().min(1).max(SESSION_LABEL_MAX_LENGTH);

/** Body of PATCH /api/agents/:id/sessions/:sessionId — the entry's new label. */
export const RenameSessionRequestSchema = z.object({
  label: SessionLabelSchema,
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

/** A session forked from the one being viewed. */
export const SessionForkSchema = z.object({
  sessionId: z.string(),
  label: z.string(),
  lastUpdatedTimestamp: z.number(),
});

/** A message that has forks, in branched order. */
export const SessionForkPointSchema = z.object({
  messageId: z.string(),
  excerpt: z.string(),
  forks: z.array(SessionForkSchema),
});

/** Response of GET /api/agents/:id/sessions/:sessionId/fork-points. */
export const SessionForkPointsSchema = z.object({
  /** In transcript order */
  forkPoints: z.array(SessionForkPointSchema),
  /** Forks whose anchor is not in the session's loaded messages */
  unavailableForks: z.array(SessionForkSchema),
});

export type RenameSessionRequest = z.infer<typeof RenameSessionRequestSchema>;
export type SessionHistoryNode = z.infer<typeof SessionHistoryNodeSchema>;
export type SessionFork = z.infer<typeof SessionForkSchema>;
export type SessionForkPoint = z.infer<typeof SessionForkPointSchema>;
export type SessionForkPoints = z.infer<typeof SessionForkPointsSchema>;
