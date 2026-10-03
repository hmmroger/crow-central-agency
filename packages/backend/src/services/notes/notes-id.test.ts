import { describe, expect, it } from "vitest";
import { ENTITY_TYPE } from "@crow-central-agency/shared";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import { toNoteName, toRenamedNoteFilename } from "./notes-id.js";

function captureError(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }

  return undefined;
}

describe("toNoteName", () => {
  it.each([
    ["My note.md", "My note"],
    ["Draft.MARKDOWN", "Draft"],
    ["photo.png", "photo.png"],
    ["photo.JPG", "photo.JPG"],
    ["song.mp3", "song.mp3"],
    ["README", "README"],
    ["archive.tar.gz", "archive.tar.gz"],
  ])("names the note %s as %s", (entryName, expected) => {
    expect(toNoteName(entryName, ENTITY_TYPE.NOTE)).toBe(expected);
  });

  it("keeps a folder's full name even when it looks like markdown", () => {
    expect(toNoteName("notes.md", ENTITY_TYPE.NOTE_FOLDER)).toBe("notes.md");
  });
});

describe("toRenamedNoteFilename", () => {
  it("appends the current markdown extension to a text note's new name", () => {
    expect(toRenamedNoteFilename("old.md", "new")).toBe("new.md");
    expect(toRenamedNoteFilename("old.markdown", "new")).toBe("new.markdown");
  });

  it("takes a non-markdown note's new name as its full filename", () => {
    expect(toRenamedNoteFilename("photo.png", "sunset.png")).toBe("sunset.png");
    expect(toRenamedNoteFilename("photo.png", "sunset.PNG")).toBe("sunset.PNG");
    expect(toRenamedNoteFilename("README", "NOTICE")).toBe("NOTICE");
  });

  it.each([
    ["photo.png", "photo.jpg"],
    ["photo.png", "photo"],
    ["photo.png", "photo.md"],
    ["README", "README.txt"],
  ])("rejects renaming %s to %s because the extension changes", (currentFilename, name) => {
    const error = captureError(() => toRenamedNoteFilename(currentFilename, name));

    expect(error).toBeInstanceOf(AppError);
    expect(error instanceof AppError ? error.errorCode : undefined).toBe(APP_ERROR_CODES.VALIDATION);
  });
});
