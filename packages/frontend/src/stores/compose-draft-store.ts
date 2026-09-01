import { useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ComposeDraftState {
  /** Work-in-progress compose text keyed by agentId. Absent key ≡ no draft. */
  drafts: Record<string, string>;
  /** Store the draft for an agent; deletes the key when text is empty/whitespace-only. */
  setDraft: (agentId: string, text: string) => void;
  /** Remove the draft for an agent (e.g. on send). */
  clearDraft: (agentId: string) => void;
  /** Drop drafts whose agent no longer exists to bound localStorage growth. */
  pruneDrafts: (validAgentIds: string[]) => void;
  /** Transcript entry the next send should branch at, keyed by agentId. Absent key ≡ no branch. */
  pendingBranchAnchorIds: Record<string, string>;
  /** Anchor an agent's next send at a transcript entry. */
  setPendingBranchAnchorId: (agentId: string, branchAnchorId: string) => void;
  /** Drop an agent's anchor (cancelled, consumed by a send, or invalidated by a run starting). */
  clearPendingBranchAnchorId: (agentId: string) => void;
  /** Agents whose branch has been sent but whose fork has not been observed landing yet. */
  branchInFlightAgentIds: Record<string, boolean>;
  /** Record that an agent's in-flight send is a branch. */
  markBranchInFlight: (agentId: string) => void;
  /** Clear an agent's in-flight branch, reporting whether one was set. */
  consumeBranchInFlight: (agentId: string) => boolean;
}

/** Shape of the state persisted to localStorage. */
interface PersistedComposeDraftState {
  drafts: Record<string, string>;
}

/** localStorage key for persisted compose drafts. */
const COMPOSE_DRAFT_STORAGE_KEY = "crow-compose-drafts";

/**
 * Per-agent compose state store — dedicated, keyed by agentId. Kept out of app-store
 * (navigation/layout only), mirroring the dedicated message-audio-store. Everything here is
 * client-only ephemeral UI state describing an unsent message; once sent it becomes
 * backend-owned history. Draft text is inert, so it persists across reloads. A branch anchor is
 * not: it is paired with the agent's session id at send time and changes what that send does, so
 * it is kept out of the persisted slice and the composer clears it on unmount. The in-flight
 * branch flag is likewise transient — it only bridges a send to the fork it triggers.
 */
export const useComposeDraftStore = create<ComposeDraftState>()(
  persist(
    (set) => ({
      drafts: {},
      pendingBranchAnchorIds: {},
      branchInFlightAgentIds: {},

      setDraft: (agentId: string, text: string) =>
        set((state) => {
          if (!text.trim()) {
            if (state.drafts[agentId] === undefined) {
              return state;
            }

            const nextDrafts = { ...state.drafts };
            delete nextDrafts[agentId];
            return { drafts: nextDrafts };
          }

          return { drafts: { ...state.drafts, [agentId]: text } };
        }),

      clearDraft: (agentId: string) =>
        set((state) => {
          if (state.drafts[agentId] === undefined) {
            return state;
          }

          const nextDrafts = { ...state.drafts };
          delete nextDrafts[agentId];
          return { drafts: nextDrafts };
        }),

      pruneDrafts: (validAgentIds: string[]) =>
        set((state) => {
          const validIds = new Set(validAgentIds);
          const nextDrafts: Record<string, string> = {};
          let changed = false;

          for (const [agentId, text] of Object.entries(state.drafts)) {
            if (validIds.has(agentId)) {
              nextDrafts[agentId] = text;
            } else {
              changed = true;
            }
          }

          if (!changed) {
            return state;
          }

          return { drafts: nextDrafts };
        }),

      setPendingBranchAnchorId: (agentId: string, branchAnchorId: string) =>
        set((state) => ({
          pendingBranchAnchorIds: { ...state.pendingBranchAnchorIds, [agentId]: branchAnchorId },
        })),

      clearPendingBranchAnchorId: (agentId: string) =>
        set((state) => {
          if (state.pendingBranchAnchorIds[agentId] === undefined) {
            return state;
          }

          const nextPendingBranchAnchorIds = { ...state.pendingBranchAnchorIds };
          delete nextPendingBranchAnchorIds[agentId];
          return { pendingBranchAnchorIds: nextPendingBranchAnchorIds };
        }),

      markBranchInFlight: (agentId: string) =>
        set((state) => ({
          branchInFlightAgentIds: { ...state.branchInFlightAgentIds, [agentId]: true },
        })),

      consumeBranchInFlight: (agentId: string) => {
        let wasInFlight = false;

        set((state) => {
          if (!state.branchInFlightAgentIds[agentId]) {
            return state;
          }

          wasInFlight = true;
          const nextBranchInFlightAgentIds = { ...state.branchInFlightAgentIds };
          delete nextBranchInFlightAgentIds[agentId];
          return { branchInFlightAgentIds: nextBranchInFlightAgentIds };
        });

        return wasInFlight;
      },
    }),
    {
      name: COMPOSE_DRAFT_STORAGE_KEY,
      partialize: (state): PersistedComposeDraftState => ({ drafts: state.drafts }),
    }
  )
);

/**
 * Bind the compose draft store to a single agent.
 * Returns the agent's current draft (empty string when absent) and a stable
 * setter that writes through to the store.
 */
export function useComposeDraft(agentId: string): { draft: string; setDraft: (text: string) => void } {
  const draft = useComposeDraftStore((state) => state.drafts[agentId] ?? "");
  const setDraftForAgent = useComposeDraftStore((state) => state.setDraft);

  const setDraft = useCallback((text: string) => setDraftForAgent(agentId, text), [setDraftForAgent, agentId]);

  return { draft, setDraft };
}

/**
 * Bind the pending branch anchor to a single agent.
 * Returns the transcript entry the next send should branch at (undefined when none) and
 * stable setters that write through to the store.
 */
export function usePendingBranchAnchor(agentId: string): {
  pendingBranchAnchorId?: string;
  setPendingBranchAnchorId: (branchAnchorId: string) => void;
  clearPendingBranchAnchorId: () => void;
} {
  const pendingBranchAnchorId = useComposeDraftStore((state) => state.pendingBranchAnchorIds[agentId]);
  const setPendingBranchAnchorIdForAgent = useComposeDraftStore((state) => state.setPendingBranchAnchorId);
  const clearPendingBranchAnchorIdForAgent = useComposeDraftStore((state) => state.clearPendingBranchAnchorId);

  const setPendingBranchAnchorId = useCallback(
    (branchAnchorId: string) => setPendingBranchAnchorIdForAgent(agentId, branchAnchorId),
    [setPendingBranchAnchorIdForAgent, agentId]
  );

  const clearPendingBranchAnchorId = useCallback(
    () => clearPendingBranchAnchorIdForAgent(agentId),
    [clearPendingBranchAnchorIdForAgent, agentId]
  );

  return { pendingBranchAnchorId, setPendingBranchAnchorId, clearPendingBranchAnchorId };
}

/**
 * Bind the in-flight branch flag to a single agent.
 * Returns stable callbacks to mark a branch as sent and to consume that mark exactly once.
 * The flag is read only through `consumeBranchInFlight`, never subscribed to, so marking a branch
 * does not re-render the composer that set it.
 */
export function useBranchInFlight(agentId: string): {
  markBranchInFlight: () => void;
  consumeBranchInFlight: () => boolean;
} {
  const markBranchInFlightForAgent = useComposeDraftStore((state) => state.markBranchInFlight);
  const consumeBranchInFlightForAgent = useComposeDraftStore((state) => state.consumeBranchInFlight);

  const markBranchInFlight = useCallback(
    () => markBranchInFlightForAgent(agentId),
    [markBranchInFlightForAgent, agentId]
  );

  const consumeBranchInFlight = useCallback(
    () => consumeBranchInFlightForAgent(agentId),
    [consumeBranchInFlightForAgent, agentId]
  );

  return { markBranchInFlight, consumeBranchInFlight };
}
