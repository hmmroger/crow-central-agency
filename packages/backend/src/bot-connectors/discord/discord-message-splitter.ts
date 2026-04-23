/** Default Discord message character limit */
const DISCORD_MAX_LENGTH = 2000;

/** Closing fence appended when splitting inside a code block */
const FENCE_SUFFIX = "\n```";
/** Opening fence prepended to the next chunk when continuing a code block */
const FENCE_PREFIX = "```\n";

/** Regex to detect an open code fence (triple backtick) */
const CODE_FENCE_REGEX = /```/g;

/**
 * Split a message into chunks that fit within Discord's character limit.
 * Splits on paragraph boundaries, then newlines, then spaces.
 * Preserves code block fences — if a split occurs inside a fenced block,
 * the fence is closed before the break and reopened after.
 */
export function splitMessage(text: string, maxLength = DISCORD_MAX_LENGTH): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;
  // Reserve space for a potential closing fence suffix so chunks never exceed maxLength
  const effectiveMax = maxLength - FENCE_SUFFIX.length;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = findSplitPoint(remaining, effectiveMax);

    // If no good split point found, hard cut
    if (splitIndex <= 0) {
      splitIndex = effectiveMax;
    }

    let chunk = remaining.slice(0, splitIndex);
    remaining = remaining.slice(splitIndex).replace(/^\n+/, "");

    // Handle code fence continuity
    const openFences = countCodeFences(chunk);
    if (openFences % 2 !== 0) {
      // Odd number of fences means we're inside a code block — close it
      chunk += FENCE_SUFFIX;
      // Reopen the fence in the next chunk
      remaining = FENCE_PREFIX + remaining;
    }

    chunks.push(chunk.trimEnd());
  }

  return chunks;
}

/**
 * Find the best split point within maxLength.
 * Tries paragraph boundaries first, then line breaks, then spaces.
 */
function findSplitPoint(text: string, maxLength: number): number {
  const window = text.slice(0, maxLength);

  // Try double newline (paragraph boundary)
  const paragraphIndex = window.lastIndexOf("\n\n");
  if (paragraphIndex > 0) {
    return paragraphIndex;
  }

  // Try single newline
  const newlineIndex = window.lastIndexOf("\n");
  if (newlineIndex > 0) {
    return newlineIndex;
  }

  // Try space
  const spaceIndex = window.lastIndexOf(" ");
  if (spaceIndex > 0) {
    return spaceIndex;
  }

  return -1;
}

/** Count the number of triple-backtick code fences in a string */
function countCodeFences(text: string): number {
  const matches = text.match(CODE_FENCE_REGEX);

  return matches ? matches.length : 0;
}
