import { getExtensionByMimeType, NOTE_IMAGE_ASSET_MIME_TYPES } from "@crow-central-agency/shared";

/** Folder created beside a note to hold the files pasted into it */
export const NOTE_ASSETS_FOLDER_NAME = "assets";

const IMAGE_ASSET_PREFIX = "image";

function padDatePart(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

/** The extension an uploaded image is stored with, or undefined when its type is not accepted. */
export function toImageAssetExtension(mimeType: string): string | undefined {
  const normalizedMimeType = mimeType.trim().toLowerCase();

  return NOTE_IMAGE_ASSET_MIME_TYPES.has(normalizedMimeType) ? getExtensionByMimeType(normalizedMimeType) : undefined;
}

/**
 * `image-YYYYMMDD-HHMMSS<ext>` in server-local time, with `-<attempt>` before the
 * extension from the first retry on, so a name taken in the same second still
 * gets a free one.
 */
export function toImageAssetFilename(createdAt: Date, extension: string, attempt: number): string {
  const date = `${createdAt.getFullYear()}${padDatePart(createdAt.getMonth() + 1)}${padDatePart(createdAt.getDate())}`;
  const time = `${padDatePart(createdAt.getHours())}${padDatePart(createdAt.getMinutes())}${padDatePart(createdAt.getSeconds())}`;
  const suffix = attempt === 0 ? "" : `-${attempt}`;

  return `${IMAGE_ASSET_PREFIX}-${date}-${time}${suffix}${extension}`;
}
