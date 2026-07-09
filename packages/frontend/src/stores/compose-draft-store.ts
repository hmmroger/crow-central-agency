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
}

/** Shape of the state persisted to localStorage. */
interface PersistedComposeDraftState {
  drafts: Record<string, string>;
}

/** localStorage key for persisted compose drafts. */
const COMPOSE_DRAFT_STORAGE_KEY = "crow-compose-drafts";

/**
 * Per-agent compose draft store — dedicated, persisted, keyed by agentId.
 * Kept out of app-store (navigation/layout only), mirroring the dedicated
 * message-audio-store. Drafts are client-only ephemeral UI state; a sent
 * message becomes backend-owned history.
 */
export const useComposeDraftStore = create<ComposeDraftState>()(
  persist(
    (set) => ({
      drafts: {},

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
