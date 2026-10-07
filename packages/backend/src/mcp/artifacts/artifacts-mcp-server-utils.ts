import { ARTIFACT_CONTENT_TYPE, ARTIFACT_TYPE } from "@crow-central-agency/shared";
import type { ArtifactMetadata } from "@crow-central-agency/shared";
import { formatLocalDateTime } from "../../utils/date-utils.js";
import { buildFileContentResult, formatVersionToken, textToolResult, type ReadLineOptions } from "../tool-utils.js";
import { last } from "es-toolkit";
import { ARTIFACT_WRITE_PRECONDITION } from "../../services/artifact/artifact-manager.types.js";
import type {
  ArtifactContentFindResult,
  ArtifactWritePrecondition,
} from "../../services/artifact/artifact-manager.types.js";

export interface LineEditResult {
  content: string;
  insertedLineCount: number;
}

export const ARTIFACT_TYPE_VALUES = Object.values(ARTIFACT_TYPE);
export const ARTIFACT_CONTENT_TYPE_VALUES = Object.values(ARTIFACT_CONTENT_TYPE);

export const WRITE_ARTIFACT_VERSION_DESCRIPTION =
  "Required to replace an existing artifact: the Version token from your most recent read. Omit to create a new artifact — omitting it against an existing filename is a conflict.";

export const buildWritePrecondition = (version?: number): ArtifactWritePrecondition =>
  version === undefined
    ? { kind: ARTIFACT_WRITE_PRECONDITION.CREATE_ONLY }
    : { kind: ARTIFACT_WRITE_PRECONDITION.MATCH_VERSION, expectedUpdatedTimestamp: version };

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
  return { content: updatedContent, insertedLineCount: newContent.length };
}

function formatLineShift(shift: number): string {
  return shift === 0 ? "later lines unchanged" : `later lines shifted by ${shift > 0 ? "+" : ""}${shift}`;
}

/** Describe what an applied line edit did to the caller's line map, so it can keep using it without re-reading. */
export function buildEditArtifactNote(
  mode: EditArtifactMode,
  startLine: number,
  endLine: number | undefined,
  insertedLineCount: number
): string {
  if (mode === EDIT_ARTIFACT_MODE.INSERT) {
    return `inserted ${insertedLineCount} line(s) before line ${startLine}; ${formatLineShift(insertedLineCount)}`;
  }

  const replacedLineCount = (endLine ?? startLine) - startLine + 1;
  const shift = insertedLineCount - replacedLineCount;
  if (insertedLineCount === 0) {
    return `lines ${startLine}-${endLine ?? startLine} removed; ${formatLineShift(shift)}`;
  }

  return `lines ${startLine}-${startLine + insertedLineCount - 1} now hold your content; ${formatLineShift(shift)}`;
}

/** Build the MCP content blocks for a read artifact result */
export function buildReadArtifactResult(
  content: string | Buffer,
  metadata: ArtifactMetadata,
  userTimezone: string,
  lineOptions?: ReadLineOptions
) {
  const header = [
    `--- METADATA ---`,
    `[Type: ${metadata.type} | Content: ${metadata.contentType} | Modified: ${formatLocalDateTime(new Date(metadata.updatedTimestamp), userTimezone)} | ${formatVersionToken(metadata.updatedTimestamp)}]`,
  ];
  if (metadata.tags?.length) {
    header.push(`[Tags: ${metadata.tags.join(", ")}]`);
  }

  return buildFileContentResult(
    header,
    content,
    {
      filename: metadata.filename,
      isText: metadata.contentType === ARTIFACT_CONTENT_TYPE.TEXT,
      resourceUri: `artifact://${metadata.entityId}/${metadata.filename}`,
      unsupportedNotice: `[Binary artifact: ${metadata.contentType} content (${metadata.size} bytes). This binary format is not supported for interpretation.]`,
    },
    lineOptions
  );
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
