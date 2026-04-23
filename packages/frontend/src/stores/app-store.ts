import { CROW_SYSTEM_AGENT_ID, type AgentTaskState } from "@crow-central-agency/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** View modes for the app - flat navigation via sidebar */
export const VIEW_MODE = {
  DASHBOARD: "dashboard",
  AGENTS: "agents",
  TASKS: "tasks",
  GRAPH: "graph",
  SETTINGS: "settings",
} as const;

export type ViewMode = (typeof VIEW_MODE)[keyof typeof VIEW_MODE];

/** Default side panel width in pixels */
const DEFAULT_SIDE_PANEL_WIDTH = 280;
/** Minimum side panel width in pixels */
export const SIDE_PANEL_MIN_WIDTH = 220;
/** Maximum side panel width in pixels */
export const SIDE_PANEL_MAX_WIDTH = 480;

interface AppState {
  /** Current view mode - controlled by sidebar */
  viewMode: ViewMode;
  /** Selected agent in the Agents view - determines which console is shown */
  selectedAgentId?: string;
  /** Whether the right side panel is open */
  sidePanelOpen: boolean;
  /** Current width of the side panel in pixels */
  sidePanelWidth: number;
  /** Access key for API authentication */
  accessKey: string | undefined;
  /** Cached client geolocation as "lat,lng" string */
  clientLocation: string | undefined;
  /** Collapsed state for dashboard circle sections, keyed by circle ID */
  collapsedCircles: Record<string, boolean>;
  /** Whether the dashboard top overview panel is collapsed to a summary strip */
  dashboardTopCollapsed: boolean;
  /** Transient task state filter — set before navigating to tasks view, consumed once */
  initialTaskFilter: AgentTaskState | undefined;
  /** Switch view mode via sidebar. Switching to AGENTS clears selectedAgentId */
  setViewMode: (mode: ViewMode) => void;
  /** Select an agent in the Agents view to show its console */
  selectAgent: (agentId: string) => void;
  /** Navigate to dashboard */
  goToDashboard: () => void;
  /** Navigate to agents view with a specific agent selected */
  goToAgentConsole: (agentId: string) => void;
  /** Toggle side panel open/closed */
  toggleSidePanel: () => void;
  /** Set side panel width (for resize) */
  setSidePanelWidth: (width: number) => void;
  /** Set or clear the access key */
  setAccessKey: (key: string | undefined) => void;
  /** Update or clear cached client geolocation */
  setClientLocation: (location: string | undefined) => void;
  /** Navigate to tasks view with an optional state filter pre-selected */
  goToTasksView: (filter?: AgentTaskState) => void;
  /** Clear the transient task filter (called by tasks view after consuming) */
  clearInitialTaskFilter: () => void;
  /** Toggle collapsed state for a dashboard circle section */
  toggleCircleCollapsed: (circleId: string) => void;
  /** Toggle collapsed state for the dashboard top overview panel */
  toggleDashboardTopCollapsed: () => void;
}

/** Shape of the state that is persisted to localStorage */
interface PersistedAppState {
  viewMode: ViewMode;
  selectedAgentId?: string;
  sidePanelOpen: boolean;
  sidePanelWidth: number;
  accessKey?: string;
  clientLocation?: string;
  collapsedCircles?: Record<string, boolean>;
  dashboardTopCollapsed?: boolean;
}

/** localStorage key for persisted app state */
const APP_STORE_STORAGE_KEY = "crow-app-state";

/**
 * App-wide store - flat navigation state.
 * Sidebar controls viewMode (DASHBOARD / AGENTS / TASKS).
 * Agent editor is a modal dialog, not a view mode.
 */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      viewMode: VIEW_MODE.DASHBOARD,
      selectedAgentId: undefined,
      sidePanelOpen: true,
      sidePanelWidth: DEFAULT_SIDE_PANEL_WIDTH,
      accessKey: undefined,
      clientLocation: undefined,
      collapsedCircles: {},
      dashboardTopCollapsed: false,
      initialTaskFilter: undefined,

      setViewMode: (mode: ViewMode) =>
        set((state) => {
          if (state.viewMode === mode) {
            return state;
          }

          return {
            viewMode: mode,
            // Always clear selection on sidebar switch; goToAgentConsole sets it explicitly
            selectedAgentId: state.selectedAgentId ?? CROW_SYSTEM_AGENT_ID,
          };
        }),

      selectAgent: (agentId: string) =>
        set((state) => {
          if (state.selectedAgentId === agentId) {
            return state;
          }

          return { selectedAgentId: agentId };
        }),

      goToDashboard: () =>
        set((state) => {
          if (state.viewMode === VIEW_MODE.DASHBOARD) {
            return state;
          }

          return { viewMode: VIEW_MODE.DASHBOARD, selectedAgentId: undefined };
        }),

      goToAgentConsole: (agentId: string) => set({ viewMode: VIEW_MODE.AGENTS, selectedAgentId: agentId }),

      toggleSidePanel: () => set((state) => ({ sidePanelOpen: !state.sidePanelOpen })),

      setSidePanelWidth: (width: number) => set({ sidePanelWidth: width }),

      setAccessKey: (key: string | undefined) => set({ accessKey: key }),

      setClientLocation: (location: string | undefined) => set({ clientLocation: location }),

      goToTasksView: (filter?: AgentTaskState) => set({ viewMode: VIEW_MODE.TASKS, initialTaskFilter: filter }),

      clearInitialTaskFilter: () => set({ initialTaskFilter: undefined }),

      toggleCircleCollapsed: (circleId: string) =>
        set((state) => ({
          collapsedCircles: { ...state.collapsedCircles, [circleId]: !state.collapsedCircles[circleId] },
        })),

      toggleDashboardTopCollapsed: () => set((state) => ({ dashboardTopCollapsed: !state.dashboardTopCollapsed })),
    }),
    {
      name: APP_STORE_STORAGE_KEY,
      version: 1,
      partialize: (state): PersistedAppState => ({
        viewMode: state.viewMode,
        selectedAgentId: state.selectedAgentId,
        sidePanelOpen: state.sidePanelOpen,
        sidePanelWidth: state.sidePanelWidth,
        accessKey: state.accessKey,
        clientLocation: state.clientLocation,
        collapsedCircles: state.collapsedCircles,
        dashboardTopCollapsed: state.dashboardTopCollapsed,
      }),
    }
  )
);
