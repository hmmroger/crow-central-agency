import type { Tokens } from "marked";
import type { TokenMarks } from "../../../utils/marked-config.types.js";
import type { FindRange } from "./find.types.js";

/** Where one token's shown text sits in the find text */
export interface MarkdownFindPiece extends FindRange {
  token: Tokens.Generic;
}

/** What a parsed document shows, as find searches it; derived from the document's tokens */
export interface MarkdownFindText {
  text: string;
  pieces: MarkdownFindPiece[];
}

/** One document's matches as marks for the document renderer */
export interface MarkdownFindMarks {
  marks: TokenMarks;
  /** Changes each time the host moves to a match, so the renderer scrolls even when it lands on the same one */
  revealKey: number;
}
