export interface ReadLineOptions {
  showLineNumber?: boolean;
  startLine?: number;
  limit?: number;
}

export interface ProcessedTextContent {
  headerParts: string[];
  text: string;
}

export interface PaginationResult<T> {
  items: T[];
  totalCount: number;
  effectiveSkip: number;
  hasMore: boolean;
}

/**
 * Creates a tool result object with text content.
 *
 * @param texts - Array of strings to be joined with newlines
 * @param isError - Optional flag indicating if this is an error result
 * @returns Object with content array containing text and optional isError flag
 */
export const textToolResult = (texts: string[], isError?: boolean) => {
  const text = texts.join("\n");
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
    isError,
  };
};

/**
 * Creates an error tool result from an exception or error object.
 *
 * @param error - The error object or unknown error to extract message from
 * @param fallbackMessage - Message to use if no error message can be extracted
 * @returns Error tool result object with isError flag set to true
 */
export const getErrorToolResult = (error: unknown, fallbackMessage: string) => {
  const exceptionError = (error as Error).message;
  const errorMessage = exceptionError ? exceptionError : fallbackMessage;
  return textToolResult([errorMessage], true);
};

export const applyPagination = <T>(allItems: T[], limit: number, skip?: number): PaginationResult<T> => {
  const effectiveSkip = skip || 0;
  const items = allItems.slice(effectiveSkip, effectiveSkip + limit);
  return {
    items,
    totalCount: allItems.length,
    effectiveSkip,
    hasMore: effectiveSkip + items.length < allItems.length,
  };
};

export const formatPaginationHeader = (
  description: string,
  pagination: PaginationResult<unknown>,
  note?: string
): string[] => {
  const { items, totalCount, effectiveSkip, hasMore } = pagination;
  const isPaginated = effectiveSkip > 0 || hasMore;

  const metaParts = [`Total: ${totalCount}`];
  if (isPaginated) {
    metaParts.push(`Showing: ${items.length}`);
  }

  if (effectiveSkip > 0) {
    metaParts.push(`Skipped: ${effectiveSkip}`);
  }

  const lines = [`--- ${description.toUpperCase()} ---`, `[${metaParts.join(" | ")}]`];
  if (note) {
    lines.push(`[${note}]`);
  }

  if (hasMore) {
    lines.push(`[More available: use skip=${effectiveSkip + items.length} for next page]`);
  }

  return lines;
};

/** Process text content: build header info, apply line slicing and optional line numbering */
export function processTextContent(text: string, options?: ReadLineOptions): ProcessedTextContent {
  const allLines = text.split("\n");
  const totalLines = allLines.length;
  const headerParts: string[] = [`[Total Lines: ${totalLines}]`];

  const hasLineOptions =
    options && (options.startLine !== undefined || options.limit !== undefined || options.showLineNumber === true);
  if (!hasLineOptions) {
    headerParts.push("--- CONTENT ---");
    return { headerParts, text };
  }

  const start = (options.startLine ?? 1) - 1;
  if (start >= totalLines) {
    headerParts.push(`--- CONTENT (startLine ${options.startLine} exceeds total ${totalLines} lines) ---`);
    return { headerParts, text: "" };
  }

  const clampedEnd = Math.min(options.limit !== undefined ? start + options.limit : totalLines, totalLines);
  const sliced = allLines.slice(start, clampedEnd);

  if (options.showLineNumber) {
    headerParts.push("Lines are prefixed with [LNNN] markers. These markers are NOT part of the note content.");
  }

  const hasRange = options.startLine !== undefined || options.limit !== undefined;
  headerParts.push(`--- CONTENT${hasRange ? ` (lines ${start + 1} - ${clampedEnd})` : ""} ---`);

  const processedText = options.showLineNumber
    ? sliced.map((line, index) => `[L${start + index + 1}] ${line}`).join("\n")
    : sliced.join("\n");

  return { headerParts, text: processedText };
}
