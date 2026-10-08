import { CROW_SYSTEM_AGENT_ID, type AgentTaskState } from "@crow-central-agency/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** View modes for the app - flat navigation via sidebar */
export const VIEW_MODE = {
  DASHBOARD: "dashboard",
  AGENTS: "agents",
  AGENT_BUILDER: "agent-builder",
  TASKS: "tasks",
  NOTES: "notes",
  SCHEDULES: "schedules",
  GRAPH: "graph",
  SETTINGS: "settings",
} as const;

export type ViewMode = (typeof VIEW_MODE)[keyof typeof VIEW_MODE];

/** Tabs of the Notes view sidebar */
export const NOTES_SIDEBAR_TAB = {
  NOTES: "notes",
  TRASH: "trash",
} as const;

export type NotesSidebarTab = (typeof NOTES_SIDEBAR_TAB)[keyof typeof NOTES_SIDEBAR_TAB];

/** Default side panel width in pixels */
const DEFAULT_SIDE_PANEL_WIDTH = 300;
/** Minimum side panel width in pixels */
export const SIDE_PANEL_MIN_WIDTH = 300;
/** Maximum side panel width in pixels */
export const SIDE_PANEL_MAX_WIDTH = 480;
/** Default notes tree sidebar width in pixels */
const DEFAULT_NOTES_SIDEBAR_WIDTH = 256;
/** Minimum notes tree sidebar width in pixels */
export const NOTES_SIDEBAR_MIN_WIDTH = 256;
/** Maximum notes tree sidebar width in pixels */
export const NOTES_SIDEBAR_MAX_WIDTH = 480;
/** Maximum number of recently visited agent ids kept */
const RECENT_AGENT_IDS_MAX = 12;
/** Maximum number of recently opened note ids kept */
const RECENT_NOTE_IDS_MAX = 12;

interface AppState {
  /** Current view mode - controlled by sidebar */
  viewMode: ViewMode;
  /** Selected agent in the Agents view - determines which console is shown */
  selectedAgentId?: string;
  /** Selected note in the Notes view - survives leaving and reopening the view */
  selectedNoteId?: string;
  /** Selected note in the trash, tracked apart from the live selection so neither clobbers the other */
  selectedTrashNoteId?: string;
  /** Active tab of the Notes view sidebar */
  notesSidebarTab: NotesSidebarTab;
  /** Whether the right side panel is open */
  sidePanelOpen: boolean;
  /** Current width of the side panel in pixels */
  sidePanelWidth: number;
  /** Current width of the notes tree sidebar in pixels */
  notesSidebarWidth: number;
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
  /** Ids of recently visited agent consoles, most recent first */
  recentAgentIds: string[];
  /** Ids of recently opened notes, most recent first */
  recentNoteIds: string[];
  /** Switch view mode via sidebar. Falls selectedAgentId back to the Crow system agent when nothing is selected */
  setViewMode: (mode: ViewMode) => void;
  /** Select an agent in the Agents view to show its console */
  selectAgent: (agentId: string) => void;
  /** Select a note in the Notes view, or clear the selection */
  selectNote: (noteId?: string) => void;
  /** Select a note in the trash, or clear the selection */
  selectTrashNote: (noteId?: string) => void;
  /** Switch the Notes view sidebar tab */
  setNotesSidebarTab: (tab: NotesSidebarTab) => void;
  /** Navigate to the Notes view with a live note selected in the Notes tab */
  goToNote: (noteId: string) => void;
  /** Navigate to dashboard */
  goToDashboard: () => void;
  /** Navigate to agents view with a specific agent selected */
  goToAgentConsole: (agentId: string) => void;
  /** Toggle side panel open/closed */
  toggleSidePanel: () => void;
  /** Set side panel width (for resize) */
  setSidePanelWidth: (width: number) => void;
  /** Set notes tree sidebar width (for resize) */
  setNotesSidebarWidth: (width: number) => void;
  /** Set or clear the access key */
  setAccessKey: (key: string | undefined) => void;
  /** Update or clear cached client geolocation */
  setClientLocation: (location: string | undefined) => void;
  /** Navigate to tasks view with an optional state filter pre-selected */
  goToTasksView: (filter?: AgentTaskState) => void;
  /** Navigate to the schedules view */
  goToSchedulesView: () => void;
  /** Clear the transient task filter (called by tasks view after consuming) */
  clearInitialTaskFilter: () => void;
  /** Toggle collapsed state for a dashboard circle section */
  toggleCircleCollapsed: (circleId: string) => void;
  /** Toggle collapsed state for the dashboard top overview panel */
  toggleDashboardTopCollapsed: () => void;
  /** Record an agent console visit, moving the agent to the front of the recents list */
  recordAgentVisit: (agentId: string) => void;
  /** Record a note being opened, moving it to the front of the recents list */
  recordNoteVisit: (noteId: string) => void;
}

/** Shape of the state that is persisted to localStorage */
interface PersistedAppState {
  viewMode: ViewMode;
  selectedAgentId?: string;
  selectedNoteId?: string;
  sidePanelOpen: boolean;
  sidePanelWidth: number;
  notesSidebarWidth?: number;
  accessKey?: string;
  clientLocation?: string;
  collapsedCircles?: Record<string, boolean>;
  dashboardTopCollapsed?: boolean;
  recentAgentIds?: string[];
  recentNoteIds?: string[];
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
      selectedNoteId: undefined,
      selectedTrashNoteId: undefined,
      notesSidebarTab: NOTES_SIDEBAR_TAB.NOTES,
      sidePanelOpen: true,
      sidePanelWidth: DEFAULT_SIDE_PANEL_WIDTH,
      notesSidebarWidth: DEFAULT_NOTES_SIDEBAR_WIDTH,
      accessKey: undefined,
      clientLocation: undefined,
      collapsedCircles: {},
      dashboardTopCollapsed: false,
      initialTaskFilter: undefined,
      recentAgentIds: [],
      recentNoteIds: [],

      setViewMode: (mode: ViewMode) =>
        set((state) => {
          if (state.viewMode === mode) {
            return state;
          }

          return {
            viewMode: mode,
            // Keep any existing selection; goToAgentConsole sets it explicitly
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

      selectNote: (noteId?: string) => set({ selectedNoteId: noteId }),

      selectTrashNote: (noteId?: string) => set({ selectedTrashNoteId: noteId }),

      setNotesSidebarTab: (tab: NotesSidebarTab) => set({ notesSidebarTab: tab }),

      goToNote: (noteId: string) =>
        set({ viewMode: VIEW_MODE.NOTES, selectedNoteId: noteId, notesSidebarTab: NOTES_SIDEBAR_TAB.NOTES }),

      toggleSidePanel: () => set((state) => ({ sidePanelOpen: !state.sidePanelOpen })),

      setSidePanelWidth: (width: number) => set({ sidePanelWidth: width }),

      setNotesSidebarWidth: (width: number) => set({ notesSidebarWidth: width }),

      setAccessKey: (key: string | undefined) => set({ accessKey: key }),

      setClientLocation: (location: string | undefined) => set({ clientLocation: location }),

      goToTasksView: (filter?: AgentTaskState) => set({ viewMode: VIEW_MODE.TASKS, initialTaskFilter: filter }),

      goToSchedulesView: () => set({ viewMode: VIEW_MODE.SCHEDULES }),

      clearInitialTaskFilter: () => set({ initialTaskFilter: undefined }),

      toggleCircleCollapsed: (circleId: string) =>
        set((state) => ({
          collapsedCircles: { ...state.collapsedCircles, [circleId]: !state.collapsedCircles[circleId] },
        })),

      toggleDashboardTopCollapsed: () => set((state) => ({ dashboardTopCollapsed: !state.dashboardTopCollapsed })),

      recordAgentVisit: (agentId: string) =>
        set((state) => {
          if (state.recentAgentIds[0] === agentId) {
            return state;
          }

          const remaining = state.recentAgentIds.filter((recentId) => recentId !== agentId);
          return { recentAgentIds: [agentId, ...remaining].slice(0, RECENT_AGENT_IDS_MAX) };
        }),

      recordNoteVisit: (noteId: string) =>
        set((state) => {
          if (state.recentNoteIds[0] === noteId) {
            return state;
          }

          const remaining = state.recentNoteIds.filter((recentId) => recentId !== noteId);
          return { recentNoteIds: [noteId, ...remaining].slice(0, RECENT_NOTE_IDS_MAX) };
        }),
    }),
    {
      name: APP_STORE_STORAGE_KEY,
      version: 1,
      partialize: (state): PersistedAppState => ({
        viewMode: state.viewMode,
        selectedAgentId: state.selectedAgentId,
        selectedNoteId: state.selectedNoteId,
        sidePanelOpen: state.sidePanelOpen,
        sidePanelWidth: state.sidePanelWidth,
        notesSidebarWidth: state.notesSidebarWidth,
        accessKey: state.accessKey,
        clientLocation: state.clientLocation,
        collapsedCircles: state.collapsedCircles,
        dashboardTopCollapsed: state.dashboardTopCollapsed,
        recentAgentIds: state.recentAgentIds,
        recentNoteIds: state.recentNoteIds,
      }),
    }
  )
);
