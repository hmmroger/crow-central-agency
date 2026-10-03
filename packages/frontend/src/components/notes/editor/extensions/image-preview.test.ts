// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  cursorCharLeft,
  cursorCharRight,
  deleteCharBackward,
  deleteCharForward,
  selectCharRight,
} from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { ENTITY_TYPE, NOTE_CONTENT_TYPE, type NoteContentType, type NoteMetadata } from "@crow-central-agency/shared";
import { createBaseSetup } from "./base-setup.js";
import { imagePreview } from "./image-preview.js";
import { markdownPreview } from "./markdown-preview.js";
import { notesTree, setNotesTree } from "./notes-tree-state.js";

const URL_IMAGE = "![cat](https://example.com/cat.png)";
const MISSING_EMBED = "![[nowhere.png]]";
const views: EditorView[] = [];

function mountEditor(doc: string, cursor: number): EditorView {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursor),
      extensions: [createBaseSetup(), markdownPreview(), notesTree(), imagePreview()],
    }),
  });

  views.push(view);

  return view;
}

function fileNote(name: string, contentType: NoteContentType): NoteMetadata {
  return {
    id: name.toLowerCase(),
    entityType: ENTITY_TYPE.NOTE,
    name,
    path: name,
    updatedTimestamp: 0,
    isReadOnly: true,
    isTrashed: false,
    contentType,
    size: 0,
  };
}

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

describe("imagePreview", () => {
  it("draws an http/https image and a missing embed, and leaves other images as text", () => {
    const view = mountEditor(`a ${URL_IMAGE} ${MISSING_EMBED} ![rel](cat.png)`, 0);

    expect(view.contentDOM.querySelector(".cm-md-image img")?.getAttribute("src")).toBe("https://example.com/cat.png");
    expect(view.contentDOM.querySelector(".cm-md-image-missing")?.textContent).toBe("Missing image: nowhere.png");
    expect(view.contentDOM.textContent).toContain("![rel](cat.png)");
  });

  it.each([
    "![x](javascript:alert(1))",
    "![x](data:image/png;base64,AAAA)",
    "![x](//example.com/a.png)",
    "![[]]",
    "![[ ]]",
    "![[a]b]]",
    "![[a[b]]",
  ])("leaves %s as text", (doc) => {
    const view = mountEditor(`x ${doc}`, 0);

    expect(view.contentDOM.querySelector(".cm-md-image, .cm-md-image-missing")).toBeNull();
  });

  it("does not match an embed that crosses a line break", () => {
    const view = mountEditor("x ![[a\nb]]", 0);

    expect(view.contentDOM.querySelector(".cm-md-image-missing")).toBeNull();
  });

  it("keeps the image drawn while the cursor sits against it", () => {
    const view = mountEditor(`${URL_IMAGE} tail`, URL_IMAGE.length);

    expect(view.contentDOM.textContent).not.toContain("https://example.com");
  });

  it("resolves an embed to an image note in the notes tree", () => {
    const view = mountEditor(`x ${MISSING_EMBED}`, 0);

    view.dispatch({ effects: setNotesTree.of([fileNote("nowhere.png", NOTE_CONTENT_TYPE.IMAGE)]) });

    expect(view.contentDOM.querySelector(".cm-md-image-missing")).toBeNull();
    expect(view.contentDOM.querySelector(".cm-md-image img")?.getAttribute("alt")).toBe("nowhere.png");
  });

  it("shows the missing chip when the embed names a note that is not an image", () => {
    const view = mountEditor(`x ${MISSING_EMBED}`, 0);
    view.dispatch({ effects: setNotesTree.of([fileNote("nowhere.png", NOTE_CONTENT_TYPE.UNKNOWN)]) });

    expect(view.contentDOM.querySelector(".cm-md-image-missing")).not.toBeNull();
  });

  it("removes the whole image with Backspace just after it", () => {
    const view = mountEditor(`a ${URL_IMAGE} b`, 2 + URL_IMAGE.length);

    deleteCharBackward(view);

    expect(view.state.doc.toString()).toBe("a  b");
  });

  it("removes the whole embed with Delete just before it", () => {
    const view = mountEditor(`a ${MISSING_EMBED} b`, 2);

    deleteCharForward(view);

    expect(view.state.doc.toString()).toBe("a  b");
  });

  it("steps the cursor over the image as one unit", () => {
    const view = mountEditor(`a ${URL_IMAGE} b`, 2);

    cursorCharRight(view);
    expect(view.state.selection.main.head).toBe(2 + URL_IMAGE.length);

    cursorCharLeft(view);
    expect(view.state.selection.main.head).toBe(2);
  });

  it.each([
    ["a URL image", `[${URL_IMAGE}](https://example.com/page)`],
    ["an embed", `[${MISSING_EMBED}](https://example.com/page)`],
  ])("draws %s inside a link inside that link", (_label, doc) => {
    const view = mountEditor(`x ${doc} y`, 0);
    const image = view.contentDOM.querySelector(".cm-md-image, .cm-md-image-missing");

    expect(image?.closest(".cm-md-link")?.getAttribute("data-url")).toBe("https://example.com/page");
  });

  it("extends a selection over the whole image", () => {
    const view = mountEditor(`a ${URL_IMAGE} b`, 2);

    selectCharRight(view);

    expect(view.state.selection.main.from).toBe(2);
    expect(view.state.selection.main.to).toBe(2 + URL_IMAGE.length);
  });
});
