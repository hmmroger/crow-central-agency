export interface ParsedMarkdown {
  html: string;
  /** Distinct `[[target]]` and `![[target]]` targets, sorted */
  wikilinkTargets: string[];
}
