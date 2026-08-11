import { useCallback } from "react";
import { create } from "zustand";
import type { BranchPoint } from "@crow-central-agency/shared";

/** A message the user picked to branch from, waiting to be consumed by the next send. */
export interface PendingBranch {
  /** The anchored message, used only to mark the selection in the message list. */
  messageId: string;
  /** The anchor as issued by the backend, echoed back verbatim on send. */
  anchor: BranchPoint;
}

interface BranchAnchorState {
  /** Pending branch keyed by agentId. Absent key ≡ the next send continues the active session. */
  pendingBranches: Record<string, PendingBranch>;
  /** Anchor an agent's compose box at a message. */
  setPendingBranch: (agentId: string, pendingBranch: PendingBranch) => void;
  /** Drop an agent's anchor (cancelled, consumed by a send, or invalidated by a run starting). */
  clearPendingBranch: (agentId: string) => void;
}

/**
 * Per-agent pending branch selection — dedicated and keyed by agentId, mirroring the
 * compose-draft store. Deliberately not persisted: an anchor is only meaningful against the
 * transcript on screen, and the backend alone decides whether it is still forkable.
 */
export const useBranchAnchorStore = create<BranchAnchorState>((set) => ({
  pendingBranches: {},

  setPendingBranch: (agentId: string, pendingBranch: PendingBranch) =>
    set((state) => ({ pendingBranches: { ...state.pendingBranches, [agentId]: pendingBranch } })),

  clearPendingBranch: (agentId: string) =>
    set((state) => {
      if (state.pendingBranches[agentId] === undefined) {
        return state;
      }

      const nextPendingBranches = { ...state.pendingBranches };
      delete nextPendingBranches[agentId];
      return { pendingBranches: nextPendingBranches };
    }),
}));

/**
 * Bind the branch anchor store to a single agent.
 * Returns the agent's pending branch (undefined when none) and stable setters.
 */
export function usePendingBranch(agentId: string): {
  pendingBranch?: PendingBranch;
  setPendingBranch: (pendingBranch: PendingBranch) => void;
  clearPendingBranch: () => void;
} {
  const pendingBranch = useBranchAnchorStore((state) => state.pendingBranches[agentId]);
  const setPendingBranchForAgent = useBranchAnchorStore((state) => state.setPendingBranch);
  const clearPendingBranchForAgent = useBranchAnchorStore((state) => state.clearPendingBranch);

  const setPendingBranch = useCallback(
    (nextPendingBranch: PendingBranch) => setPendingBranchForAgent(agentId, nextPendingBranch),
    [setPendingBranchForAgent, agentId]
  );

  const clearPendingBranch = useCallback(
    () => clearPendingBranchForAgent(agentId),
    [clearPendingBranchForAgent, agentId]
  );

  return { pendingBranch, setPendingBranch, clearPendingBranch };
}
