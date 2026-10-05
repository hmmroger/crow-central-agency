export const MIME_TYPE = {
  PNG: "image/png",
  JPEG: "image/jpeg",
  GIF: "image/gif",
  WEBP: "image/webp",
  BMP: "image/bmp",
  ICO: "image/x-icon",
  SVG: "image/svg+xml",
  TIFF: "image/tiff",
  MP3: "audio/mpeg",
  WAV: "audio/wav",
  OGG: "audio/ogg",
  FLAC: "audio/flac",
  AAC: "audio/aac",
  M4A: "audio/mp4",
  WMA: "audio/x-ms-wma",
  PDF: "application/pdf",
  DOC: "application/msword",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

const IMAGE_MIME_PREFIX = "image/";
const AUDIO_MIME_PREFIX = "audio/";

const KNOWN_FILE_EXTENSION = new Map<string, string>([
  [".png", MIME_TYPE.PNG],
  [".jpg", MIME_TYPE.JPEG],
  [".jpeg", MIME_TYPE.JPEG],
  [".gif", MIME_TYPE.GIF],
  [".webp", MIME_TYPE.WEBP],
  [".bmp", MIME_TYPE.BMP],
  [".ico", MIME_TYPE.ICO],
  [".svg", MIME_TYPE.SVG],
  [".tiff", MIME_TYPE.TIFF],
  [".mp3", MIME_TYPE.MP3],
  [".wav", MIME_TYPE.WAV],
  [".ogg", MIME_TYPE.OGG],
  [".flac", MIME_TYPE.FLAC],
  [".aac", MIME_TYPE.AAC],
  [".m4a", MIME_TYPE.M4A],
  [".wma", MIME_TYPE.WMA],
  [".pdf", MIME_TYPE.PDF],
  [".doc", MIME_TYPE.DOC],
  [".docx", MIME_TYPE.DOCX],
]);

const EXTENSION_BY_MIME_TYPE = new Map<string, string>();
for (const [extension, mimeType] of KNOWN_FILE_EXTENSION) {
  if (!EXTENSION_BY_MIME_TYPE.has(mimeType)) {
    EXTENSION_BY_MIME_TYPE.set(mimeType, extension);
  }
}

export function isImageFileExtension(extension: string): boolean {
  return KNOWN_FILE_EXTENSION.get(extension)?.startsWith(IMAGE_MIME_PREFIX) ?? false;
}

export function isAudioFileExtension(extension: string): boolean {
  return KNOWN_FILE_EXTENSION.get(extension)?.startsWith(AUDIO_MIME_PREFIX) ?? false;
}

export function isKnownBinaryExtension(extension: string): boolean {
  return KNOWN_FILE_EXTENSION.has(extension);
}

export function getMimeTypeByFilename(filename: string): string | undefined {
  const basename = filename.slice(Math.max(filename.lastIndexOf("/"), filename.lastIndexOf("\\")) + 1);
  const dotIndex = basename.lastIndexOf(".");

  return dotIndex > 0 ? KNOWN_FILE_EXTENSION.get(basename.slice(dotIndex).toLowerCase()) : undefined;
}

export function getExtensionByMimeType(mimeType: string): string | undefined {
  return EXTENSION_BY_MIME_TYPE.get(mimeType.trim().toLowerCase());
}
