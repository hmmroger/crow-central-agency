import { create } from "zustand";

/** View modes for the app — view-state-based navigation, no URL router */
export const VIEW_MODE = {
  DASHBOARD: "dashboard",
  CONSOLE: "console",
  AGENT_EDITOR: "agent-editor",
} as const;

export type ViewMode = (typeof VIEW_MODE)[keyof typeof VIEW_MODE];

/** A snapshot of view state — used for current view and history stack */
export interface ViewState {
  viewMode: ViewMode;
  activeAgentId?: string;
}

interface AppState {
  /** The active view */
  currentView: ViewState;
  /** History stack of previous views (not including current) — enables back navigation */
  viewStack: ViewState[];
  /** Navigate to dashboard — clears stack (home) */
  goToDashboard: () => void;
  /** Navigate to agent console — pushes current view to stack */
  goToConsole: (agentId: string) => void;
  /** Navigate to agent editor (create or edit) — pushes current view to stack */
  goToAgentEditor: (agentId?: string) => void;
  /** Go back to previous view — pops stack */
  goBack: () => void;
}

const DASHBOARD_VIEW: ViewState = { viewMode: VIEW_MODE.DASHBOARD };
const MAX_VIEW_STACK_DEPTH = 10;

/**
 * App-wide store — navigation state with view stack for back navigation.
 * No real-time agent data here (that's owned by components via WS hooks).
 */
export const useAppStore = create<AppState>((set) => ({
  currentView: DASHBOARD_VIEW,
  viewStack: [],

  goToDashboard: () =>
    set({
      currentView: DASHBOARD_VIEW,
      viewStack: [],
    }),

  goToConsole: (agentId: string) =>
    set((state) => ({
      viewStack: [...state.viewStack, state.currentView].slice(-MAX_VIEW_STACK_DEPTH),
      currentView: { viewMode: VIEW_MODE.CONSOLE, activeAgentId: agentId },
    })),

  goToAgentEditor: (agentId?: string) =>
    set((state) => ({
      viewStack: [...state.viewStack, state.currentView].slice(-MAX_VIEW_STACK_DEPTH),
      currentView: { viewMode: VIEW_MODE.AGENT_EDITOR, activeAgentId: agentId },
    })),

  goBack: () =>
    set((state) => {
      if (state.viewStack.length === 0) {
        return { currentView: DASHBOARD_VIEW, viewStack: [] };
      }

      const previous = state.viewStack[state.viewStack.length - 1];

      return {
        currentView: previous,
        viewStack: state.viewStack.slice(0, -1),
      };
    }),
}));
