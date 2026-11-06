export const SESSION_FORK_NODE_TYPE = {
  FORK_POINT: "fork_point",
  FORK: "fork",
} as const;

/** What a row in the Forks tree points at; the unavailable group points at nothing */
export type SessionForkNodeData =
  | { type: typeof SESSION_FORK_NODE_TYPE.FORK_POINT; messageId: string }
  | { type: typeof SESSION_FORK_NODE_TYPE.FORK; sessionId: string };
