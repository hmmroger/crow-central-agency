import type { BranchPoint, SessionHistory, SessionHistoryNode } from "@crow-central-agency/shared";

export interface SessionHistoryUpdate {
  sessionId: string;
  message: string;
  timestamp: number;
  /** Set only when the session was created by branching; stored verbatim on the new entry */
  branchPoint?: BranchPoint;
}

export interface UpdatedSessionHistory {
  history: SessionHistory[];
  sessionTree?: SessionHistoryNode[];
}
