import type { Tokens, TokensList } from "marked";

export interface LexedMarkdown {
  tokens: TokensList;
  /** Distinct `[[target]]` and `![[target]]` targets, sorted */
  wikilinkTargets: string[];
}

/** A highlighted range within the text one token shows */
export interface TextMark {
  start: number;
  end: number;
  isCurrent: boolean;
}

/** Marks keyed by the token whose shown text they cover, in text order */
export type TokenMarks = ReadonlyMap<Tokens.Generic, TextMark[]>;
