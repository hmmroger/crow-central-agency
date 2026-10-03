import { describe, expect, it } from "vitest";
import {
  getExtensionByMimeType,
  getMimeTypeByFilename,
  isAudioFileExtension,
  isImageFileExtension,
  isKnownBinaryExtension,
  MIME_TYPE,
} from "./mime-type.js";

describe("getMimeTypeByFilename", () => {
  it("maps a known extension regardless of case", () => {
    expect(getMimeTypeByFilename("photo.JPEG")).toBe(MIME_TYPE.JPEG);
  });

  it("uses only the last segment of a path", () => {
    expect(getMimeTypeByFilename("folder.png/notes/assets/image.webp")).toBe(MIME_TYPE.WEBP);
    expect(getMimeTypeByFilename("folder\\image.gif")).toBe(MIME_TYPE.GIF);
    expect(getMimeTypeByFilename("folder.png/readme")).toBeUndefined();
  });

  it("treats a leading dot as a hidden file, not an extension", () => {
    expect(getMimeTypeByFilename("assets/.png")).toBeUndefined();
  });

  it("returns undefined for an unknown or missing extension", () => {
    expect(getMimeTypeByFilename("note.md")).toBeUndefined();
    expect(getMimeTypeByFilename("image")).toBeUndefined();
  });
});

describe("getExtensionByMimeType", () => {
  it("picks the first extension listed for a type", () => {
    expect(getExtensionByMimeType(MIME_TYPE.JPEG)).toBe(".jpg");
  });

  it("normalizes whitespace and case", () => {
    expect(getExtensionByMimeType(" IMAGE/PNG ")).toBe(".png");
  });

  it("returns undefined for an unknown type", () => {
    expect(getExtensionByMimeType("text/html")).toBeUndefined();
  });
});

describe("extension categories", () => {
  it("classifies image, audio and other binary extensions", () => {
    expect(isImageFileExtension(".webp")).toBe(true);
    expect(isImageFileExtension(".mp3")).toBe(false);
    expect(isAudioFileExtension(".mp3")).toBe(true);
    expect(isKnownBinaryExtension(".pdf")).toBe(true);
    expect(isKnownBinaryExtension(".md")).toBe(false);
  });
});
