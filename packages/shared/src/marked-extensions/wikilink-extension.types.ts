import type { Tokens } from "marked";

export const WIKILINK_TOKEN = "wikilink";

/** `[[target]]`, or `![[target]]` when `isEmbed` */
export interface WikilinkToken extends Tokens.Generic {
  type: typeof WIKILINK_TOKEN;
  /** Unescaped and trimmed, ready to resolve */
  target: string;
  isEmbed: boolean;
}
