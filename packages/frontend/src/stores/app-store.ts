import { create } from "zustand";

/** View modes for the app — view-state-based navigation, no URL router */
export const VIEW_MODE = {
  DASHBOARD: "dashboard",
  CONSOLE: "console",
  AGENT_EDITOR: "agent-editor",
} as const;

export type ViewMode = (typeof VIEW_MODE)[keyof typeof VIEW_MODE];

interface AppState {
  /** Currently selected agent ID */
  activeAgentId: string | undefined;
  /** Current view mode */
  viewMode: ViewMode;
  /** Navigate to dashboard */
  goToDashboard: () => void;
  /** Navigate to agent console */
  goToConsole: (agentId: string) => void;
  /** Navigate to agent editor (create or edit) */
  goToAgentEditor: (agentId?: string) => void;
}

/**
 * Minimal app-wide store — only navigation state.
 * No real-time agent data here (that's owned by components via WS hooks).
 */
export const useAppStore = create<AppState>((set) => ({
  activeAgentId: undefined,
  viewMode: VIEW_MODE.DASHBOARD,

  goToDashboard: () => set({ viewMode: VIEW_MODE.DASHBOARD, activeAgentId: undefined }),

  goToConsole: (agentId: string) => set({ viewMode: VIEW_MODE.CONSOLE, activeAgentId: agentId }),

  goToAgentEditor: (agentId?: string) => set({ viewMode: VIEW_MODE.AGENT_EDITOR, activeAgentId: agentId }),
}));
