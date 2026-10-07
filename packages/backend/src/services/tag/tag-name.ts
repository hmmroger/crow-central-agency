import { normalizeTagName } from "@crow-central-agency/shared";

/** Normalize tags for storage and comparison: normalize each name, dedupe, and sort. */
export function normalizeTags(tags?: string[]): string[] {
  if (!tags) {
    return [];
  }

  const normalizedTags = new Set<string>(tags.map((tag) => normalizeTagName(tag)).filter((tag) => tag));
  return Array.from(normalizedTags).sort();
}
