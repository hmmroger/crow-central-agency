import { z } from "zod";
import type { ZodError, ZodRawShape } from "zod";

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
  effectiveOffset: number;
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

/**
 * Build an object schema from a tool input shape. Schemas with parameters are strict so unknown parameters are
 * rejected rather than silently dropped; no-arg tools stay lenient since there is no parameter to confuse.
 */
export const buildStrictToolSchema = (inputSchema: ZodRawShape) => {
  const schema = z.object(inputSchema);
  return Object.keys(inputSchema).length > 0 ? schema.strict() : schema;
};

/** Format a Zod validation failure as an agent-facing error result that names the offending parameters. */
export const getValidationErrorToolResult = (toolName: string, error: ZodError) => {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return textToolResult([`Invalid arguments for ${toolName}:`, ...issues], true);
};

export const applyPagination = <T>(allItems: T[], limit: number, offset?: number): PaginationResult<T> => {
  const effectiveOffset = offset || 0;
  const items = allItems.slice(effectiveOffset, effectiveOffset + limit);
  return {
    items,
    totalCount: allItems.length,
    effectiveOffset,
    hasMore: effectiveOffset + items.length < allItems.length,
  };
};

export const formatPaginationHeader = (
  description: string,
  pagination: PaginationResult<unknown>,
  note?: string
): string[] => {
  const { items, totalCount, effectiveOffset, hasMore } = pagination;
  const isPaginated = effectiveOffset > 0 || hasMore;

  const metaParts = [`Total: ${totalCount}`];
  if (isPaginated) {
    metaParts.push(`Showing: ${items.length}`);
  }

  if (effectiveOffset > 0) {
    metaParts.push(`Offset: ${effectiveOffset}`);
  }

  const lines = [`--- ${description.toUpperCase()} ---`, `[${metaParts.join(" | ")}]`];
  if (note) {
    lines.push(`[${note}]`);
  }

  if (hasMore) {
    lines.push(`[More available: use offset=${effectiveOffset + items.length} for next page]`);
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
    headerParts.push("Lines are prefixed with [LNNN] markers. These markers are NOT part of the line content.");
  }

  const hasRange = options.startLine !== undefined || options.limit !== undefined;
  if (clampedEnd < totalLines) {
    headerParts.push(`[More available: use startLine=${clampedEnd + 1} to continue]`);
  }

  headerParts.push(`--- CONTENT${hasRange ? ` (lines ${start + 1} - ${clampedEnd})` : ""} ---`);

  const processedText = options.showLineNumber
    ? sliced.map((line, index) => `[L${start + index + 1}] ${line}`).join("\n")
    : sliced.join("\n");

  return { headerParts, text: processedText };
}
