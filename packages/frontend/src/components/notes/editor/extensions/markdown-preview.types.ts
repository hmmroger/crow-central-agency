import type { DecorationSet } from "@codemirror/view";

export interface BlockDecorations {
  decorations: DecorationSet;
  /** The images, which the cursor steps over and a delete removes whole */
  atomicRanges: DecorationSet;
}
