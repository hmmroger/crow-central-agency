import type { FindQuery, FindRange } from "../../../../common/find/find.types.js";

export interface EditorFindState {
  query: FindQuery | undefined;
  /** Source ranges, in document order */
  matches: FindRange[];
  currentIndex: number | undefined;
}
