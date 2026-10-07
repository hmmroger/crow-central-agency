/** Canonical composition, so a name typed as composed or decomposed characters is the same tag */
const TAG_NORMALIZATION_FORM = "NFC";

/** Normalize tags for storage and comparison: trim, lowercase, Unicode-normalize, dedupe, and sort. */
export function normalizeTags(tags?: string[]): string[] {
  if (!tags) {
    return [];
  }

  // Normalized after lowercasing, since lowercasing can itself produce decomposed characters.
  const normalizedTags = new Set<string>(
    tags.map((tag) => tag.trim().toLowerCase().normalize(TAG_NORMALIZATION_FORM)).filter((tag) => tag)
  );
  return Array.from(normalizedTags).sort();
}
