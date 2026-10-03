import { describe, expect, it } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { NOTE_CONTENT_TYPE } from "@crow-central-agency/shared";
import { folderFixture as folder, noteFixture as note } from "../../../../utils/note-metadata.fixtures.js";
import { createBaseSetup } from "./base-setup.js";
import { currentNote } from "./current-note-state.js";
import { notesTree, setNotesTree } from "./notes-tree-state.js";
import { completeWikilink, selectWikilinkSuggestions, toWikilinkCompletion } from "./wikilink-autocomplete.js";

const TRIP = folder("trip");
const WORK = folder("work");
const CURRENT = note("Journal.md", "Journal", NOTE_CONTENT_TYPE.TEXT, 900);
const ROOT_PLAN = note("Plan.md", "Plan", NOTE_CONTENT_TYPE.TEXT, 100);
const TRIP_PLAN = note("trip/Plan.md", "Plan", NOTE_CONTENT_TYPE.TEXT, 200);
const TRIP_PACKING = note("trip/Packing plan.md", "Packing plan", NOTE_CONTENT_TYPE.TEXT, 300);
const WORK_SPEC = note("work/Spec [draft].md", "Spec [draft]", NOTE_CONTENT_TYPE.TEXT, 400);
const TRIP_PHOTO = note("trip/plan.png", "plan.png", NOTE_CONTENT_TYPE.IMAGE, 500);
const WORK_CHART = note("work/chart.png", "chart.png", NOTE_CONTENT_TYPE.IMAGE, 600);
const NOTES = [TRIP, WORK, CURRENT, ROOT_PLAN, TRIP_PLAN, TRIP_PACKING, WORK_SPEC, TRIP_PHOTO, WORK_CHART];

function suggest(query: string, isEmbed = false): string[] {
  return selectWikilinkSuggestions(NOTES, { query, isEmbed, currentNoteId: CURRENT.id }).map(
    (suggestion) => suggestion.id
  );
}

function complete(doc: string, position = doc.length) {
  const state = EditorState.create({
    doc,
    extensions: [createBaseSetup(), notesTree(), currentNote(CURRENT.id)],
  }).update({ effects: setNotesTree.of(NOTES) }).state;

  return completeWikilink(new CompletionContext(state, position, false));
}

describe("selectWikilinkSuggestions", () => {
  it("offers the five most recently updated notes for an empty query, never folders or the current note", () => {
    expect(suggest("")).toEqual([WORK_CHART.id, TRIP_PHOTO.id, WORK_SPEC.id, TRIP_PACKING.id, TRIP_PLAN.id]);
  });

  it("matches names case-insensitively, prefix matches first and then the most recent", () => {
    expect(suggest("PLAN")).toEqual([TRIP_PHOTO.id, TRIP_PLAN.id, ROOT_PLAN.id, TRIP_PACKING.id]);
  });

  it("matches the folder path when the query holds a slash", () => {
    expect(suggest("trip/pl")).toEqual([TRIP_PHOTO.id, TRIP_PLAN.id]);
  });

  it("offers only image notes to an embed", () => {
    expect(suggest("", true)).toEqual([WORK_CHART.id, TRIP_PHOTO.id]);
    expect(suggest("plan", true)).toEqual([TRIP_PHOTO.id]);
  });

  it("caps the matches at ten", () => {
    const manyNotes = Array.from({ length: 12 }, (_value, index) => note(`Note ${index}.md`, `Note ${index}`));

    expect(selectWikilinkSuggestions(manyNotes, { query: "note", isEmbed: false })).toHaveLength(10);
  });
});

describe("toWikilinkCompletion", () => {
  it("shows the name and folder and applies the shortest unique target", () => {
    expect(toWikilinkCompletion(NOTES, TRIP_PLAN)).toEqual({ label: "Plan", detail: "trip", apply: "[[trip/Plan]]" });
    expect(toWikilinkCompletion(NOTES, TRIP_PACKING)).toMatchObject({ apply: "[[Packing plan]]" });
  });

  it("escapes brackets in the applied target", () => {
    expect(toWikilinkCompletion(NOTES, WORK_SPEC).apply).toBe("[[Spec \\[draft\\]]]");
  });

  it("has no folder detail for a note at the root", () => {
    expect(toWikilinkCompletion(NOTES, ROOT_PLAN).detail).toBeUndefined();
  });
});

describe("completeWikilink", () => {
  it("replaces from [[ through the cursor", () => {
    const result = complete("See [[pack");

    expect(result).toMatchObject({ from: 4, to: 10 });
    expect(result?.options.map((option) => option.apply)).toEqual(["[[Packing plan]]"]);
  });

  it("keeps an embed's ! and offers images only", () => {
    const result = complete("![[ch");

    expect(result).toMatchObject({ from: 1, to: 5 });
    expect(result?.options.map((option) => option.apply)).toEqual(["[[chart.png]]"]);
  });

  it("also replaces a ]] that follows the cursor", () => {
    expect(complete("[[pack]] after", 6)).toMatchObject({ from: 0, to: 8 });
  });

  it("does nothing outside an open [[ or inside code", () => {
    expect(complete("[[Plan]] and more")).toBeNull();
    expect(complete("`[[pa` after", 5)).toBeNull();
    expect(complete("```\n[[pa")).toBeNull();
  });
});
