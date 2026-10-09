import type { ReactNode } from "react";

export interface CommandPaletteItem<TValue> {
  /** Stable React key, unique within the list */
  key: string;
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  value: TValue;
}

/** Dialog container classes for every palette, applied through showDialog's className */
export const COMMAND_PALETTE_DIALOG_CLASS_NAME = "w-[95vw] md:w-lg h-command-palette";
