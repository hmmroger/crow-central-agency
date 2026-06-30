import path from "node:path";
import { ARTIFACT_CONTENT_TYPE, ARTIFACT_TYPE } from "@crow-central-agency/shared";
import type { ArtifactMetadata } from "@crow-central-agency/shared";
import { formatLocalDateTime } from "../../utils/date-utils.js";
import { processTextContent, textToolResult, type ReadLineOptions } from "../tool-utils.js";
import { last } from "es-toolkit";
import type { ArtifactContentFindResult } from "../../services/artifact/artifact-manager.types.js";

export const ARTIFACT_TYPE_VALUES = Object.values(ARTIFACT_TYPE);
export const ARTIFACT_CONTENT_TYPE_VALUES = Object.values(ARTIFACT_CONTENT_TYPE);

/** Default cap on lines returned by read artifact tools to avoid flooding the context with large text artifacts. */
export const DEFAULT_READ_ARTIFACT_LINE_LIMIT = 100;

export const EDIT_ARTIFACT_MODE = {
  INSERT: "insert",
  REPLACE: "replace",
} as const;
export type EditArtifactMode = (typeof EDIT_ARTIFACT_MODE)[keyof typeof EDIT_ARTIFACT_MODE];
export const EDIT_ARTIFACT_MODE_VALUES = Object.values(EDIT_ARTIFACT_MODE);

/**
 * Apply an insert/replace line edit. Lines are 1-based; endLine is inclusive (used for replace only).
 * Throws when line numbers are out of range or endLine is missing/invalid for replace.
 */
export function applyLineEdit(
  existingContent: string,
  content: string,
  mode: EditArtifactMode,
  startLine: number,
  endLine?: number
): string {
  const existingLines = existingContent.split("\n");
  const totalLines = existingLines.length;

  if (startLine < 1) {
    throw new Error("startLine must be a positive integer starting from 1.");
  }

  // allow adding a line after last line
  if (startLine > totalLines + 1) {
    throw new Error(`Starting line (${startLine}) exceeds the total number of lines (${totalLines}).`);
  }

  if (mode === EDIT_ARTIFACT_MODE.REPLACE) {
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
  const effectiveEnd = mode === EDIT_ARTIFACT_MODE.REPLACE && endLine !== undefined ? endLine : startLine - 1;
  const postContent = existingLines.slice(effectiveEnd);
  const newContent = content.split("\n");
  const lastLine = last(newContent);
  if (lastLine !== undefined && !lastLine) {
    newContent.splice(-1, 1);
  }

  const updatedContent = preContent.concat(newContent).concat(postContent).join("\n");
  return updatedContent;
}

/** Image extensions that Claude can process natively via base64 */
const SUPPORTED_IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/** PDF extension for document support */
const PDF_MIME = "application/pdf";

/** Build the MCP content blocks for a read artifact result */
export function buildReadArtifactResult(
  content: string | Buffer,
  metadata: ArtifactMetadata,
  userTimezone: string,
  lineOptions?: ReadLineOptions
) {
  const header = [
    `--- METADATA ---`,
    `[Type: ${metadata.type} | Content: ${metadata.contentType} | Modified: ${formatLocalDateTime(new Date(metadata.updatedTimestamp), userTimezone)} | Version: ${metadata.updatedTimestamp}]`,
  ];
  if (metadata.tags?.length) {
    header.push(`[Tags: ${metadata.tags.join(", ")}]`);
  }

  if (typeof content === "string" || metadata.contentType === ARTIFACT_CONTENT_TYPE.TEXT) {
    const rawText = typeof content === "string" ? content : content.toString("utf-8");
    const processed = processTextContent(rawText, lineOptions);
    return textToolResult(header.concat(processed.headerParts).concat(["", processed.text]));
  }

  const ext = path.extname(metadata.filename).toLowerCase();
  const imageMime = SUPPORTED_IMAGE_MIME[ext];

  if (imageMime) {
    return {
      content: [
        { type: "text" as const, text: header.join("\n") },
        { type: "image" as const, data: content.toString("base64"), mimeType: imageMime },
      ],
    };
  }

  if (ext === ".pdf") {
    return {
      content: [
        { type: "text" as const, text: header.join("\n") },
        {
          type: "resource" as const,
          resource: {
            uri: `artifact://${metadata.entityId}/${metadata.filename}`,
            mimeType: PDF_MIME,
            blob: content.toString("base64"),
          },
        },
      ],
    };
  }

  return textToolResult([
    ...header,
    `[Binary artifact: ${metadata.contentType} content (${metadata.size} bytes). This binary format is not supported for interpretation.]`,
  ]);
}

/** Build the MCP text result for a find-content search. Dedupes by line; honors an optional limit on lines. */
export function buildFindContentResult(
  filename: string,
  query: string,
  result: ArtifactContentFindResult,
  limit?: number
) {
  if (!result.found) {
    return textToolResult([`No matches found for "${query}" in ${filename}.`]);
  }

  const seenLines = new Set<number>();
  const shownLines: string[] = [];
  for (const match of result.matches) {
    if (seenLines.has(match.lineNumber)) {
      continue;
    }

    seenLines.add(match.lineNumber);
    if (limit === undefined || shownLines.length < limit) {
      shownLines.push(`[L${match.lineNumber}] ${match.lineContent}`);
    }
  }

  const truncated = limit !== undefined && seenLines.size > limit;
  const lines: string[] = [
    `Found ${seenLines.size} matching line(s) for "${query}" in ${filename}${truncated ? ` (showing first ${limit})` : ""}:`,
    "Lines are prefixed with [LNNN] markers. These markers are NOT part of the line content.",
    ...shownLines,
  ];

  return textToolResult(lines);
}
