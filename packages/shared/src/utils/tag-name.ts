/** Canonical composition, so a name typed as composed or decomposed characters is the same tag */
const TAG_NORMALIZATION_FORM = "NFC";

/**
 * The form a tag name is stored and compared in: trimmed, lowercased, then
 * Unicode-normalized, since lowercasing can itself produce decomposed characters.
 */
export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase().normalize(TAG_NORMALIZATION_FORM);
}
