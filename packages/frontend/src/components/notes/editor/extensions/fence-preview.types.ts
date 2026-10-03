import type { DecorationSet, WidgetType } from "@codemirror/view";

/** Every fence preview carries it, so a click on any of them selects the fence's source */
export const FENCE_PREVIEW_CLASS = "cm-md-fence-preview";

/** The widget a terminated fence of one language is drawn as */
export type CreateFenceWidget = (source: string) => WidgetType;

/** A terminated fence with a preview, spanning whole lines */
export interface FenceBlock {
  from: number;
  to: number;
  source: string;
  createWidget: CreateFenceWidget;
}

export interface FencePreviewState {
  blocks: FenceBlock[];
  /** Per block, whether the selection touches it so its source shows instead */
  revealed: boolean[];
  decorations: DecorationSet;
}
