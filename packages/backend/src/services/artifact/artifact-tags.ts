/** Normalize tags for storage and comparison: trim, lowercase, dedupe, and sort. */
export function normalizeTags(tags?: string[]): string[] {
  if (!tags) {
    return [];
  }

  const normalizedTags = new Set<string>(tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag));
  return Array.from(normalizedTags).sort();
}
