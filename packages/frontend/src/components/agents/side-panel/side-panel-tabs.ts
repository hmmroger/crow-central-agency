import { Activity, CircleDot, FileText, History } from "lucide-react";
import type { TabDefinition } from "../../common/tab-bar.js";

export const SIDE_PANEL_TAB = {
  STATUS: "status",
  SESSION_HISTORY: "session-history",
  ARTIFACTS: "artifacts",
  CIRCLE_ARTIFACTS: "circle-artifacts",
} as const;

export type SidePanelTab = (typeof SIDE_PANEL_TAB)[keyof typeof SIDE_PANEL_TAB];

export const SIDE_PANEL_TABS: TabDefinition<SidePanelTab>[] = [
  { id: SIDE_PANEL_TAB.STATUS, label: "Status", icon: Activity },
  { id: SIDE_PANEL_TAB.SESSION_HISTORY, label: "Sessions", icon: History },
  { id: SIDE_PANEL_TAB.ARTIFACTS, label: "Artifacts", icon: FileText },
  { id: SIDE_PANEL_TAB.CIRCLE_ARTIFACTS, label: "Circle", icon: CircleDot },
];
