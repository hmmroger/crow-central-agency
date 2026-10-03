import { describe, expect, it } from "vitest";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { folderFixture as folder, noteFixture as note } from "./note-metadata.fixtures";
import { planWikilinkCreation, toWikilinkCreationKey } from "./wikilink-create";

const TRIP = folder("trip");
const TRIP_DAYS = folder("trip/days");
const WORK = folder("work");
const WORK_TRIP = folder("work/trip");
const ROOT_NOTE = note("Index.md", "Index");
const TRIP_NOTE = note("trip/Plan.md", "Plan");
const TRIP_FILE = note("trip/days.md", "days");
const NOTES = [TRIP, TRIP_DAYS, WORK, WORK_TRIP, ROOT_NOTE, TRIP_NOTE, TRIP_FILE];

describe("planWikilinkCreation", () => {
  it("creates a bare name beside the current note", () => {
    expect(planWikilinkCreation(NOTES, "Packing", TRIP_NOTE)).toEqual({
      parentId: TRIP.id,
      missingFolderNames: [],
      noteName: "Packing",
    });
  });

  it("creates a bare name at the root when the current note is at the root or unknown", () => {
    const rootPlan = { parentId: undefined, missingFolderNames: [], noteName: "Packing" };

    expect(planWikilinkCreation(NOTES, "Packing", ROOT_NOTE)).toEqual(rootPlan);
    expect(planWikilinkCreation(NOTES, "Packing", undefined)).toEqual(rootPlan);
  });

  it("places a qualified target from the notes root, not beside the current note", () => {
    expect(planWikilinkCreation(NOTES, "trip/Packing", WORK_TRIP)).toEqual({
      parentId: TRIP.id,
      missingFolderNames: [],
      noteName: "Packing",
    });
  });

  it("reuses existing folders case-insensitively and lists the missing ones in order", () => {
    expect(planWikilinkCreation(NOTES, "Trip/Days/monday/morning/Walk", ROOT_NOTE)).toEqual({
      parentId: TRIP_DAYS.id,
      missingFolderNames: ["monday", "morning"],
      noteName: "Walk",
    });
  });

  it("creates every folder when the first one is missing", () => {
    expect(planWikilinkCreation(NOTES, "home/garden/Beds", TRIP_NOTE)).toEqual({
      parentId: undefined,
      missingFolderNames: ["home", "garden"],
      noteName: "Beds",
    });
  });

  it("matches folders only, so a note sharing a folder's name is not a parent", () => {
    const notes = [TRIP, TRIP_FILE];

    expect(planWikilinkCreation(notes, "trip/days/Walk", ROOT_NOTE)).toEqual({
      parentId: TRIP.id,
      missingFolderNames: ["days"],
      noteName: "Walk",
    });
  });

  it("ignores blank segments and surrounding spaces", () => {
    expect(planWikilinkCreation(NOTES, " / work // Plan ", ROOT_NOTE)).toEqual({
      parentId: WORK.id,
      missingFolderNames: [],
      noteName: "Plan",
    });
  });

  it("plans nothing for a blank target", () => {
    expect(planWikilinkCreation(NOTES, " / ", ROOT_NOTE)).toBeUndefined();
  });
});

describe("toWikilinkCreationKey", () => {
  function keyOf(target: string, currentNote: NoteMetadata | undefined): string | undefined {
    const plan = planWikilinkCreation(NOTES, target, currentNote);

    return plan && toWikilinkCreationKey(plan);
  }

  it("gives every spelling of the same new note one key", () => {
    const key = keyOf("Packing", TRIP_NOTE);

    expect(keyOf("packing", TRIP_NOTE)).toBe(key);
    expect(keyOf(" PACKING ", TRIP_NOTE)).toBe(key);
    expect(keyOf("Trip/packing", ROOT_NOTE)).toBe(key);
  });

  it("keeps notes in different places or with missing folders apart", () => {
    const keys = new Set([
      keyOf("Packing", TRIP_NOTE),
      keyOf("Packing", ROOT_NOTE),
      keyOf("work/Packing", ROOT_NOTE),
      keyOf("trip/days/Packing", ROOT_NOTE),
      keyOf("trip/new/Packing", ROOT_NOTE),
    ]);

    expect(keys.size).toBe(5);
  });
});
