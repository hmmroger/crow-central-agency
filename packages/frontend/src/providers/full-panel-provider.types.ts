import type { ReactNode } from "react";

/** Configuration for a full-panel takeover. */
export interface FullPanelConfig {
  /** Unique id used by the provider to track open/close and toggling. */
  id: string;
  /** Optional title rendered in the panel's header bar. */
  title?: string;
  /** Content rendered inside the panel body. */
  content: ReactNode;
  /** Called when the panel dismisses (close button or programmatic hide). */
  onClose?: () => void;
}

/** Value exposed by the FullPanelProvider context. */
export interface FullPanelContextValue {
  /** Open (or replace) the current full panel. */
  show: (config: FullPanelConfig) => void;
  /** Dismiss the currently open full panel, if any. */
  hide: () => void;
  /** Whether a panel with the given id is currently open. */
  isOpen: (id: string) => boolean;
  /** The currently open panel config, if any. */
  current: FullPanelConfig | undefined;
}
