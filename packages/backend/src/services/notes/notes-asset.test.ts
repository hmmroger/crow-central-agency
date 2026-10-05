import { describe, expect, it } from "vitest";
import { toImageAssetExtension, toImageAssetFilename } from "./notes-asset.js";

describe("toImageAssetExtension", () => {
  it.each([
    ["image/png", ".png"],
    ["image/jpeg", ".jpg"],
    ["image/gif", ".gif"],
    ["image/webp", ".webp"],
    [" IMAGE/PNG ", ".png"],
  ])("accepts %s as %s", (mimeType, expected) => {
    expect(toImageAssetExtension(mimeType)).toBe(expected);
  });

  it.each(["image/svg+xml", "image/bmp", "text/html", "application/octet-stream", ""])("rejects %s", (mimeType) => {
    expect(toImageAssetExtension(mimeType)).toBeUndefined();
  });
});

describe("toImageAssetFilename", () => {
  const createdAt = new Date(2026, 8, 7, 9, 4, 5);

  it("stamps the name with the zero-padded local date and time", () => {
    expect(toImageAssetFilename(createdAt, ".png", 0)).toBe("image-20260907-090405.png");
  });

  it("adds the retry number before the extension", () => {
    expect(toImageAssetFilename(createdAt, ".webp", 1)).toBe("image-20260907-090405-1.webp");
    expect(toImageAssetFilename(createdAt, ".webp", 12)).toBe("image-20260907-090405-12.webp");
  });
});
