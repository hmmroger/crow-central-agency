import path from "node:path";
import { ARTIFACT_CONTENT_TYPE, type ArtifactContentType } from "@crow-central-agency/shared";
import { isAudioFileExtension, isImageFileExtension, isKnownBinaryExtension } from "../../utils/mime-type.js";

/** Check if a buffer looks like text content by examining bytes for binary indicators */
function isTextContent(sample: Buffer): boolean {
  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    // Null byte is a strong binary indicator
    if (byte === 0x00) {
      return false;
    }

    // Non-text control characters (excluding tab, LF, CR, form-feed, backspace, ESC)
    if (byte < 0x08 || (byte > 0x0d && byte < 0x1b) || byte === 0x7f) {
      return false;
    }
  }

  return true;
}

/**
 * Detect content type from filename extension and content bytes.
 * 1. Check extension for known image/audio types
 * 2. Check extension for other known binary types (pdf, etc.)
 * 3. Examine content bytes: if text -> TEXT
 * 4. Otherwise -> BINARY
 */
export function detectArtifactContentType(filename: string, sample: Buffer): ArtifactContentType {
  const ext = path.extname(filename).toLowerCase();

  if (isImageFileExtension(ext)) {
    return ARTIFACT_CONTENT_TYPE.IMAGE;
  }

  if (isAudioFileExtension(ext)) {
    return ARTIFACT_CONTENT_TYPE.AUDIO;
  }

  if (isKnownBinaryExtension(ext)) {
    return ARTIFACT_CONTENT_TYPE.BINARY;
  }

  if (isTextContent(sample)) {
    return ARTIFACT_CONTENT_TYPE.TEXT;
  }

  return ARTIFACT_CONTENT_TYPE.BINARY;
}
