export const IMAGE_SYNTAX_KIND = {
  /** `![[target]]`, resolved through the notes tree */
  EMBED: "embed",
  /** `![alt](url)` with an absolute http/https url */
  URL: "url",
} as const;

interface ImageSyntaxRange {
  from: number;
  to: number;
  /** The markdown the image stands in for */
  source: string;
}

export type ImageSyntax =
  | (ImageSyntaxRange & { kind: typeof IMAGE_SYNTAX_KIND.EMBED; target: string })
  | (ImageSyntaxRange & { kind: typeof IMAGE_SYNTAX_KIND.URL; url: string; alt: string });
