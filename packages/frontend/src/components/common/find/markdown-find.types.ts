import type { Tokens } from "marked";
import type { LexedMarkdown } from "../../../utils/marked-config.types.js";
import type { FindRange } from "./find.types.js";

/** Where one token's shown text sits in the find text */
export interface MarkdownFindPiece extends FindRange {
  token: Tokens.Generic;
}

export interface MarkdownFindText {
  text: string;
  pieces: MarkdownFindPiece[];
}

/** An item's content lexed once, feeding both rendering and find */
export interface MarkdownDocument {
  lexed: LexedMarkdown;
  findText: MarkdownFindText;
}

/** One item's matches, for the renderer to draw */
export interface MarkdownFindInput {
  document: MarkdownDocument;
  matches: FindRange[];
  currentIndex?: number;
}
