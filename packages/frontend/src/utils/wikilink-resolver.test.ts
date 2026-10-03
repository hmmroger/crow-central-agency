import { describe, expect, it } from "vitest";
import { NOTE_CONTENT_TYPE } from "@crow-central-agency/shared";
import { folderFixture as folder, noteFixture as note } from "./note-metadata.fixtures";
import { resolveWikilinkTarget, toShortestWikilinkTarget } from "./wikilink-resolver";

const TRIP = folder("trip");
const TRIP_ASSETS = folder("trip/assets");
const WORK = folder("work");
const WORK_TRIP = folder("work/trip");
const ROOT_PLAN = note("Plan.md", "Plan");
const TRIP_PLAN = note("trip/Plan.md", "Plan");
const WORK_TRIP_PLAN = note("work/trip/Plan.md", "Plan");
const TRIP_IMAGE = note("trip/assets/image-1.png", "image-1.png", NOTE_CONTENT_TYPE.IMAGE);
const WORK_IMAGE = note("work/image-1.png", "image-1.png", NOTE_CONTENT_TYPE.IMAGE);
const UNIQUE_IMAGE = note("trip/assets/photo.jpg", "photo.jpg", NOTE_CONTENT_TYPE.IMAGE);
const IDEAS_FOLDER = folder("work/Ideas");
const IDEAS_NOTE = note("trip/Ideas.md", "Ideas");

const NOTES = [
  TRIP,
  TRIP_ASSETS,
  WORK,
  WORK_TRIP,
  WORK_TRIP_PLAN,
  TRIP_PLAN,
  ROOT_PLAN,
  TRIP_IMAGE,
  WORK_IMAGE,
  UNIQUE_IMAGE,
  IDEAS_FOLDER,
  IDEAS_NOTE,
];

describe("resolveWikilinkTarget", () => {
  it("resolves a bare name, preferring the root-level note", () => {
    expect(resolveWikilinkTarget(NOTES, "Plan")).toBe(ROOT_PLAN);
  });

  it("prefers the root-anchored match over an earlier deeper one", () => {
    expect(resolveWikilinkTarget(NOTES, "trip/Plan")).toBe(TRIP_PLAN);
    expect(resolveWikilinkTarget(NOTES, "work/trip/Plan")).toBe(WORK_TRIP_PLAN);
  });

  it("treats folder segments as a suffix of the folder path", () => {
    expect(resolveWikilinkTarget(NOTES, "assets/image-1.png")).toBe(TRIP_IMAGE);
    expect(resolveWikilinkTarget(NOTES, "work/image-1.png")).toBe(WORK_IMAGE);
  });

  it("falls back to the first match when none is root-anchored", () => {
    expect(resolveWikilinkTarget(NOTES, "image-1.png")).toBe(TRIP_IMAGE);
  });

  it("prefers a note over a folder among unanchored matches", () => {
    expect(resolveWikilinkTarget(NOTES, "Ideas")).toBe(IDEAS_NOTE);
  });

  it("resolves a folder when it is the only match", () => {
    expect(resolveWikilinkTarget(NOTES, "assets")).toBe(TRIP_ASSETS);
  });

  it("matches names case-insensitively and ignores blank segments", () => {
    expect(resolveWikilinkTarget(NOTES, "TRIP/ASSETS/Photo.JPG")).toBe(UNIQUE_IMAGE);
    expect(resolveWikilinkTarget(NOTES, " trip / /Plan ")).toBe(TRIP_PLAN);
  });

  it("needs the extension to name a non-markdown note", () => {
    expect(resolveWikilinkTarget(NOTES, "photo")).toBeUndefined();
  });

  it("returns undefined when nothing matches", () => {
    expect(resolveWikilinkTarget(NOTES, "missing")).toBeUndefined();
    expect(resolveWikilinkTarget(NOTES, "work/assets/image-1.png")).toBeUndefined();
    expect(resolveWikilinkTarget(NOTES, " / ")).toBeUndefined();
  });
});

describe("toShortestWikilinkTarget", () => {
  it("uses the bare name when it is unique", () => {
    expect(toShortestWikilinkTarget(NOTES, UNIQUE_IMAGE)).toBe("photo.jpg");
  });

  it("prepends parent folders until exactly one note matches", () => {
    expect(toShortestWikilinkTarget(NOTES, TRIP_IMAGE)).toBe("assets/image-1.png");
    expect(toShortestWikilinkTarget(NOTES, WORK_IMAGE)).toBe("work/image-1.png");
  });

  it("falls back to the full path, which resolves by root anchoring", () => {
    expect(toShortestWikilinkTarget(NOTES, ROOT_PLAN)).toBe("Plan");
    expect(toShortestWikilinkTarget(NOTES, TRIP_PLAN)).toBe("trip/Plan");
    expect(toShortestWikilinkTarget(NOTES, WORK_TRIP_PLAN)).toBe("work/trip/Plan");
  });

  it("round-trips every note through resolveWikilinkTarget", () => {
    for (const metadata of NOTES) {
      expect(resolveWikilinkTarget(NOTES, toShortestWikilinkTarget(NOTES, metadata))).toBe(metadata);
    }
  });
});
