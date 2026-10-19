import { z } from "zod";
import type { ZodError, ZodRawShape } from "zod";
import { getMimeTypeByFilename, MIME_TYPE } from "@crow-central-agency/shared";
import { last } from "es-toolkit";

/** How a read tool presents one file's content after its metadata header. */
export interface FileContentPresentation {
  /** Decides the image or PDF presentation of binary content */
  filename: string;
  isText: boolean;
  /** Identifies an embedded PDF resource */
  resourceUri: string;
  /** Shown in place of binary content that cannot be presented */
  unsupportedNotice: string;
}

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

export interface LineEditResult {
  content: string;
  insertedLineCount: number;
}

/** Default cap on lines returned by read tools to avoid flooding the context with large text files. */
export const DEFAULT_READ_LINE_LIMIT = 100;

export const LINE_EDIT_MODE = {
  INSERT: "insert",
  REPLACE: "replace",
} as const;
export type LineEditMode = (typeof LINE_EDIT_MODE)[keyof typeof LINE_EDIT_MODE];
export const LINE_EDIT_MODE_VALUES = Object.values(LINE_EDIT_MODE);

/** Image types that Claude can process natively via base64 */
const SUPPORTED_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  MIME_TYPE.JPEG,
  MIME_TYPE.PNG,
  MIME_TYPE.GIF,
  MIME_TYPE.WEBP,
]);

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

/** Single definition of the Version token rendering shared by read headers and mutation results. */
export const formatVersionToken = (updatedTimestamp: number) => `Version: ${updatedTimestamp}`;

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

/**
 * Build the MCP content blocks of a file read: text in line windows, supported images as image
 * content, PDFs as an embedded resource, and any other binary content as a notice.
 */
export function buildFileContentResult(
  header: string[],
  content: string | Buffer,
  file: FileContentPresentation,
  lineOptions?: ReadLineOptions
) {
  if (typeof content === "string" || file.isText) {
    const rawText = typeof content === "string" ? content : content.toString("utf-8");
    const processed = processTextContent(rawText, lineOptions);
    return textToolResult(header.concat(processed.headerParts).concat(["", processed.text]));
  }

  const mimeType = getMimeTypeByFilename(file.filename);

  if (mimeType && SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    return {
      content: [
        { type: "text" as const, text: header.join("\n") },
        { type: "image" as const, data: content.toString("base64"), mimeType },
      ],
    };
  }

  if (mimeType === MIME_TYPE.PDF) {
    return {
      content: [
        { type: "text" as const, text: header.join("\n") },
        {
          type: "resource" as const,
          resource: { uri: file.resourceUri, mimeType, blob: content.toString("base64") },
        },
      ],
    };
  }

  return textToolResult(header.concat(file.unsupportedNotice));
}

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

/**
 * Apply an insert/replace line edit. Lines are 1-based; endLine is inclusive (used for replace only).
 * Throws when line numbers are out of range or endLine is missing/invalid for replace.
 */
export function applyLineEdit(
  existingContent: string,
  content: string,
  mode: LineEditMode,
  startLine: number,
  endLine?: number
): LineEditResult {
  const existingLines = existingContent.split("\n");
  const totalLines = existingLines.length;

  if (startLine < 1) {
    throw new Error("startLine must be a positive integer starting from 1.");
  }

  // allow adding a line after last line
  if (startLine > totalLines + 1) {
    throw new Error(`Starting line (${startLine}) exceeds the total number of lines (${totalLines}).`);
  }

  if (mode === LINE_EDIT_MODE.REPLACE) {
    if (endLine === undefined) {
      throw new Error("endLine is required for 'replace' mode.");
    }

    if (endLine > totalLines) {
      throw new Error(`Ending line (${endLine}) exceeds the total number of lines (${totalLines}).`);
    }

    if (endLine < startLine) {
      throw new Error(`Ending line (${endLine}) must be greater than or equal to starting line (${startLine}).`);
    }
  }

  const preContent = existingLines.slice(0, startLine - 1);
  const effectiveEnd = mode === LINE_EDIT_MODE.REPLACE && endLine !== undefined ? endLine : startLine - 1;
  const postContent = existingLines.slice(effectiveEnd);
  const newContent = content.split("\n");
  const lastLine = last(newContent);
  if (lastLine !== undefined && !lastLine) {
    newContent.splice(-1, 1);
  }

  const updatedContent = preContent.concat(newContent).concat(postContent).join("\n");
  return { content: updatedContent, insertedLineCount: newContent.length };
}

function formatLineShift(shift: number): string {
  return shift === 0 ? "later lines unchanged" : `later lines shifted by ${shift > 0 ? "+" : ""}${shift}`;
}

/** Describe what an applied line edit did to the caller's line map, so it can keep using it without re-reading. */
export function buildLineEditNote(
  mode: LineEditMode,
  startLine: number,
  endLine: number | undefined,
  insertedLineCount: number
): string {
  if (mode === LINE_EDIT_MODE.INSERT) {
    return `inserted ${insertedLineCount} line(s) before line ${startLine}; ${formatLineShift(insertedLineCount)}`;
  }

  const replacedLineCount = (endLine ?? startLine) - startLine + 1;
  const shift = insertedLineCount - replacedLineCount;
  if (insertedLineCount === 0) {
    return `lines ${startLine}-${endLine ?? startLine} removed; ${formatLineShift(shift)}`;
  }

  return `lines ${startLine}-${startLine + insertedLineCount - 1} now hold your content; ${formatLineShift(shift)}`;
}
