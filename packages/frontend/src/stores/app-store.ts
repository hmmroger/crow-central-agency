import { create } from "zustand";

/** View modes for the app — flat navigation via sidebar, no view stack */
export const VIEW_MODE = {
  DASHBOARD: "dashboard",
  AGENTS: "agents",
  AGENT_EDITOR: "agent-editor",
} as const;

export type ViewMode = (typeof VIEW_MODE)[keyof typeof VIEW_MODE];

interface AppState {
  /** Current view mode — controlled by sidebar (DASHBOARD, AGENTS) or programmatic navigation (AGENT_EDITOR) */
  viewMode: ViewMode;
  /** Selected agent in the Agents view — determines which console is shown */
  selectedAgentId?: string;
  /** Agent being edited in the editor view — undefined means "create new" */
  editorAgentId?: string;
  /** Switch view mode via sidebar. Switching to AGENTS clears selectedAgentId */
  setViewMode: (mode: ViewMode) => void;
  /** Select an agent in the Agents view to show its console */
  selectAgent: (agentId: string) => void;
  /** Open the agent editor — set viewMode to AGENT_EDITOR and store which agent to edit */
  openAgentEditor: (agentId?: string) => void;
  /** Navigate to dashboard */
  goToDashboard: () => void;
  /** Navigate to agents view with a specific agent selected */
  goToAgentConsole: (agentId: string) => void;
}

/**
 * App-wide store — flat navigation state.
 * Sidebar controls viewMode (DASHBOARD / AGENTS). Agent editor is a full view.
 * No view stack — sidebar switching is flat, editor always returns to dashboard.
 */
export const useAppStore = create<AppState>((set) => ({
  viewMode: VIEW_MODE.DASHBOARD,
  selectedAgentId: undefined,
  editorAgentId: undefined,

  setViewMode: (mode: ViewMode) =>
    set((state) => {
      if (state.viewMode === mode) {
        return state;
      }

      return {
        viewMode: mode,
        // Clear selectedAgentId when switching to AGENTS via sidebar
        selectedAgentId: mode === VIEW_MODE.AGENTS ? undefined : state.selectedAgentId,
        editorAgentId: undefined,
      };
    }),

  selectAgent: (agentId: string) =>
    set((state) => {
      if (state.selectedAgentId === agentId) {
        return state;
      }

      return { selectedAgentId: agentId };
    }),

  openAgentEditor: (agentId?: string) =>
    set((state) => {
      if (state.viewMode === VIEW_MODE.AGENT_EDITOR && state.editorAgentId === agentId) {
        return state;
      }

      return { viewMode: VIEW_MODE.AGENT_EDITOR, editorAgentId: agentId };
    }),

  goToDashboard: () =>
    set((state) => {
      if (state.viewMode === VIEW_MODE.DASHBOARD) {
        return state;
      }

      return { viewMode: VIEW_MODE.DASHBOARD, editorAgentId: undefined };
    }),

  goToAgentConsole: (agentId: string) =>
    set({ viewMode: VIEW_MODE.AGENTS, selectedAgentId: agentId, editorAgentId: undefined }),
}));
