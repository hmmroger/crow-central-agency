import { create } from "zustand";
import { persist } from "zustand/middleware";

/** View modes for the app - flat navigation via sidebar, no view stack */
export const VIEW_MODE = {
  DASHBOARD: "dashboard",
  AGENTS: "agents",
  AGENT_EDITOR: "agent-editor",
} as const;

export type ViewMode = (typeof VIEW_MODE)[keyof typeof VIEW_MODE];

/** Default side panel width in pixels */
const DEFAULT_SIDE_PANEL_WIDTH = 280;
/** Minimum side panel width in pixels */
export const SIDE_PANEL_MIN_WIDTH = 220;
/** Maximum side panel width in pixels */
export const SIDE_PANEL_MAX_WIDTH = 480;

interface AppState {
  /** Current view mode - controlled by sidebar (DASHBOARD, AGENTS) or programmatic navigation (AGENT_EDITOR) */
  viewMode: ViewMode;
  /** Selected agent in the Agents view - determines which console is shown */
  selectedAgentId?: string;
  /** Agent being edited in the editor view - undefined means "create new" */
  editorAgentId?: string;
  /** Whether the right side panel is open */
  sidePanelOpen: boolean;
  /** Current width of the side panel in pixels */
  sidePanelWidth: number;
  /** Switch view mode via sidebar. Switching to AGENTS clears selectedAgentId */
  setViewMode: (mode: ViewMode) => void;
  /** Select an agent in the Agents view to show its console */
  selectAgent: (agentId: string) => void;
  /** Open the agent editor - set viewMode to AGENT_EDITOR and store which agent to edit */
  openAgentEditor: (agentId?: string) => void;
  /** Navigate to dashboard */
  goToDashboard: () => void;
  /** Navigate to agents view with a specific agent selected */
  goToAgentConsole: (agentId: string) => void;
  /** Toggle side panel open/closed */
  toggleSidePanel: () => void;
  /** Set side panel width (for resize) */
  setSidePanelWidth: (width: number) => void;
}

/**
 * App-wide store - flat navigation state.
 * Sidebar controls viewMode (DASHBOARD / AGENTS). Agent editor is a full view.
 * No view stack - sidebar switching is flat, editor always returns to dashboard.
 */
/** localStorage key for persisted app state */
const APP_STORE_STORAGE_KEY = "crow-app-state";

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      viewMode: VIEW_MODE.DASHBOARD,
      selectedAgentId: undefined,
      editorAgentId: undefined,
      sidePanelOpen: true,
      sidePanelWidth: DEFAULT_SIDE_PANEL_WIDTH,

      setViewMode: (mode: ViewMode) =>
        set((state) => {
          if (state.viewMode === mode) {
            return state;
          }

          return {
            viewMode: mode,
            // Always clear selection on sidebar switch; goToAgentConsole sets it explicitly
            selectedAgentId: undefined,
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

          return { viewMode: VIEW_MODE.DASHBOARD, selectedAgentId: undefined, editorAgentId: undefined };
        }),

      goToAgentConsole: (agentId: string) =>
        set({ viewMode: VIEW_MODE.AGENTS, selectedAgentId: agentId, editorAgentId: undefined }),

      toggleSidePanel: () => set((state) => ({ sidePanelOpen: !state.sidePanelOpen })),

      setSidePanelWidth: (width: number) => set({ sidePanelWidth: width }),
    }),
    {
      name: APP_STORE_STORAGE_KEY,
      partialize: (state) => ({
        viewMode: state.viewMode,
        selectedAgentId: state.selectedAgentId,
        editorAgentId: state.editorAgentId,
        sidePanelOpen: state.sidePanelOpen,
        sidePanelWidth: state.sidePanelWidth,
      }),
    }
  )
);
