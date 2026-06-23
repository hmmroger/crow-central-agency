import { NARRATIVE_ARTIFACT_BEGIN, NARRATIVE_ARTIFACT_END } from "./world-builder.constants.js";

const LEADING_PREAMBLE_PATTERN = /^\s*(?:here(?:'s| is| are)|sure[,!.]?|certainly[,!.]?)[^\n]*:\s*\n/i;
const CODE_FENCE_PATTERN = /^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/;

/**
 * Extract the architect's artifact from a raw assistant message. Reads strictly between the sentinel
 * markers when present; otherwise falls back to stripping a surrounding code fence and a leading
 * "Here is …:" preamble. Always returns trimmed text.
 */
export function extractGenerated(rawText: string): string {
  const beginIndex = rawText.indexOf(NARRATIVE_ARTIFACT_BEGIN);
  const endIndex = rawText.lastIndexOf(NARRATIVE_ARTIFACT_END);
  if (beginIndex !== -1 && endIndex !== -1 && endIndex > beginIndex) {
    return rawText.slice(beginIndex + NARRATIVE_ARTIFACT_BEGIN.length, endIndex).trim();
  }

  const withoutPreamble = rawText.replace(LEADING_PREAMBLE_PATTERN, "");
  const fenceMatch = withoutPreamble.match(CODE_FENCE_PATTERN);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  return withoutPreamble.trim();
}
