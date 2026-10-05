import type { Tokens } from "marked";

export const TAG_TOKEN = {
  TAGLINE: "tagline",
  HASHTAG: "hashtag",
} as const;

/** Extends `Tokens.Generic` so a hashtag is assignable to `Token[]` for `parseInline()` */
export interface HashtagToken extends Tokens.Generic {
  type: typeof TAG_TOKEN.HASHTAG;
  /** The tag without its `#` */
  text: string;
}

/** The trailing tag lines of the input, holding each tag in order */
export interface TagLineToken extends Tokens.Generic {
  type: typeof TAG_TOKEN.TAGLINE;
  tokens: HashtagToken[];
}
