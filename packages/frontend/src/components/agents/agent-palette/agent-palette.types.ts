import type { AgentConfig } from "@crow-central-agency/shared";

/** Why the palette is showing the agents it is showing - drives the section label */
export const AGENT_PALETTE_MODE = {
  RECENT: "recent",
  ALL: "all",
  RESULTS: "results",
} as const;

export type AgentPaletteMode = (typeof AGENT_PALETTE_MODE)[keyof typeof AGENT_PALETTE_MODE];

export interface AgentPaletteEntry {
  agent: AgentConfig;
  /** True when this row is the agent console currently on screen */
  isCurrent: boolean;
}

export interface AgentPaletteList {
  mode: AgentPaletteMode;
  entries: AgentPaletteEntry[];
}

/** Dialog id, shared by the open hook and any caller that needs to address the palette */
export const AGENT_PALETTE_DIALOG_ID = "agent-palette";
/** Id of the sr-only heading naming the dialog */
export const AGENT_PALETTE_LABEL_ID = "agent-palette-label";
