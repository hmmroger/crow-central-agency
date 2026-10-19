import { ARTIFACT_CONTENT_TYPE, ARTIFACT_TYPE } from "@crow-central-agency/shared";
import type { ArtifactMetadata } from "@crow-central-agency/shared";
import { formatLocalDateTime } from "../../utils/date-utils.js";
import { buildFileContentResult, formatVersionToken, textToolResult, type ReadLineOptions } from "../tool-utils.js";
import { ARTIFACT_WRITE_PRECONDITION } from "../../services/artifact/artifact-manager.types.js";
import type {
  ArtifactContentFindResult,
  ArtifactWritePrecondition,
} from "../../services/artifact/artifact-manager.types.js";

export const ARTIFACT_TYPE_VALUES = Object.values(ARTIFACT_TYPE);
export const ARTIFACT_CONTENT_TYPE_VALUES = Object.values(ARTIFACT_CONTENT_TYPE);

export const WRITE_ARTIFACT_VERSION_DESCRIPTION =
  "Required to replace an existing artifact: the Version token from your most recent read. Omit to create a new artifact — omitting it against an existing filename is a conflict.";

export const buildWritePrecondition = (version?: number): ArtifactWritePrecondition =>
  version === undefined
    ? { kind: ARTIFACT_WRITE_PRECONDITION.CREATE_ONLY }
    : { kind: ARTIFACT_WRITE_PRECONDITION.MATCH_VERSION, expectedUpdatedTimestamp: version };

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
