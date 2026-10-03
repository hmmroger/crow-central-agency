// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createBaseSetup } from "./base-setup.js";
import { markdownPreview } from "./markdown-preview.js";

const HTMLVIEW_FENCE = "```htmlview\n<p>Hello <b>there</b></p><script>alert(1)</script>\n```";
const views: EditorView[] = [];

function mountEditor(doc: string, cursor: number): EditorView {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursor),
      extensions: [createBaseSetup(), markdownPreview()],
    }),
  });

  views.push(view);

  return view;
}

function findHtmlviewPreview(view: EditorView): Element | null {
  return view.contentDOM.querySelector(".cm-md-htmlview-preview");
}

afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
  }
});

describe("fence preview widget", () => {
  it("draws an htmlview fence as its sanitized embed in a shadow root", () => {
    const view = mountEditor(`intro\n\n${HTMLVIEW_FENCE}`, 0);
    const shadow = findHtmlviewPreview(view)?.shadowRoot;

    expect(shadow?.querySelector("b")?.textContent).toBe("there");
    expect(shadow?.querySelector("script")).toBeNull();
    expect(view.contentDOM.textContent).not.toContain("<p>Hello");
  });

  it("shows the source while the cursor is inside the fence", () => {
    const doc = `intro\n\n${HTMLVIEW_FENCE}`;
    const view = mountEditor(doc, doc.indexOf("Hello"));

    expect(findHtmlviewPreview(view)).toBeNull();
    expect(view.contentDOM.textContent).toContain("<p>Hello");
  });

  it("leaves an unterminated htmlview fence as code", () => {
    const view = mountEditor("intro\n\n```htmlview\n<p>Hello</p>", 0);

    expect(findHtmlviewPreview(view)).toBeNull();
  });
});
