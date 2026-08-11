import type { BranchPoint } from "@crow-central-agency/shared";

export interface SessionHistoryAppend {
  sessionId: string;
  message: string;
  workspace: string;
  timestamp: number;
  /** Set only when the session was created by branching; stored verbatim on the new entry */
  branchPoint?: BranchPoint;
}
