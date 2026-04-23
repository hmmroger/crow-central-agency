import path from "node:path";

export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const KNOWN_FILE_EXTENSION = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".bmp", "image/bmp"],
  [".ico", "image/x-icon"],
  [".svg", "image/svg+xml"],
  [".tiff", "image/tiff"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".ogg", "audio/ogg"],
  [".flac", "audio/flac"],
  [".aac", "audio/aac"],
  [".m4a", "audio/mp4"],
  [".wma", "audio/x-ms-wma"],
  [".pdf", "application/pdf"],
  [".doc", "application/msword"],
  [".docx", DOCX_MIME_TYPE],
]);

const IMAGE_EXTENSIONS = new Set(
  Array.from(KNOWN_FILE_EXTENSION.entries())
    .filter(([, value]) => value.startsWith("image/"))
    .map(([key]) => key)
);

const AUDIO_EXTENSIONS = new Set(
  Array.from(KNOWN_FILE_EXTENSION.entries())
    .filter(([, value]) => value.startsWith("audio/"))
    .map(([key]) => key)
);

export function isImageFileExtension(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext);
}

export function isAudioFileExtension(ext: string): boolean {
  return AUDIO_EXTENSIONS.has(ext);
}

/** Check if the extension is a known binary format (image, audio, pdf, etc.) */
export function isKnownBinaryExtension(ext: string): boolean {
  return KNOWN_FILE_EXTENSION.has(ext);
}

/** Get MIME type for a filename based on its extension, or undefined if unknown */
export function getMimeTypeByFilename(filename: string): string | undefined {
  const ext = path.extname(filename).toLowerCase();
  return KNOWN_FILE_EXTENSION.get(ext);
}
