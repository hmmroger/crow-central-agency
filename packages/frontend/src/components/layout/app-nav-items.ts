import { Bot, LayoutDashboard, ListTodo, Network, Settings, type LucideIcon } from "lucide-react";
import { VIEW_MODE, type ViewMode } from "../../stores/app-store.js";

export interface AppNavItem {
  mode: ViewMode;
  icon: LucideIcon;
  label: string;
  /** Items rendered at the visual bottom of the nav (separated). */
  pinBottom?: boolean;
}

/** Shared nav items used by both the AppSidebar and the AppHeader logo menu (mobile). */
export const APP_NAV_ITEMS: AppNavItem[] = [
  { mode: VIEW_MODE.DASHBOARD, icon: LayoutDashboard, label: "Dashboard" },
  { mode: VIEW_MODE.AGENTS, icon: Bot, label: "Agents" },
  { mode: VIEW_MODE.TASKS, icon: ListTodo, label: "Tasks" },
  { mode: VIEW_MODE.GRAPH, icon: Network, label: "Circles Map" },
  { mode: VIEW_MODE.SETTINGS, icon: Settings, label: "Settings", pinBottom: true },
];
