// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { undo } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createBaseSetup } from "./base-setup.js";
import { clickHandler } from "./click-handler.js";
import { findSyntaxAncestor } from "./cm-extension-utils.js";
import { getFencedCodeText } from "./markdown-syntax.js";
import { SYNTAX_NODE } from "./markdown-syntax.types.js";
import { markdownPreview } from "./markdown-preview.js";

const views: EditorView[] = [];

function mountEditor(doc: string, cursor: number): EditorView {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursor),
      extensions: [createBaseSetup(), markdownPreview(), clickHandler()],
    }),
  });

  views.push(view);

  return view;
}

function extractFencedCode(doc: string): string | undefined {
  const { state } = mountEditor(doc, 0);
  const fencedCode = findSyntaxAncestor(state, doc.indexOf("```") + 1, SYNTAX_NODE.FENCED_CODE);

  return fencedCode ? getFencedCodeText(state, fencedCode) : undefined;
}

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
});

describe("markdown preview", () => {
  it("hides link syntax outside the selection and exposes the URL", () => {
    const view = mountEditor("start\n\nsee [the docs](https://example.com) here", 0);
    const link = view.contentDOM.querySelector<HTMLElement>(".cm-md-link");

    expect(link?.textContent).toBe("the docs");
    expect(link?.dataset.url).toBe("https://example.com");
    expect(view.contentDOM.textContent).not.toContain("](https://example.com)");
  });

  it("shows raw syntax while the cursor is inside the construct", () => {
    const doc = "see **bold** here";
    const view = mountEditor(doc, doc.indexOf("bold"));

    expect(view.contentDOM.textContent).toContain("**bold**");
  });

  it("hides emphasis markers and heading marks elsewhere", () => {
    const view = mountEditor("start\n\n## Title\n\nsome **bold** text", 0);

    expect(view.contentDOM.textContent).not.toContain("**");
    expect(view.contentDOM.textContent).not.toContain("## ");
    expect(view.contentDOM.querySelector(".cm-md-h2")?.textContent).toBe("Title");
    expect(view.contentDOM.querySelector(".cm-md-strong")?.textContent).toBe("bold");
  });

  it("draws a horizontal rule outside the selection and shows its syntax inside", () => {
    const doc = "start\n\n---\n\nend";

    expect(mountEditor(doc, 0).contentDOM.querySelector("hr.cm-md-hr")).not.toBeNull();

    const view = mountEditor(doc, doc.indexOf("---"));

    expect(view.contentDOM.querySelector("hr.cm-md-hr")).toBeNull();
    expect(view.contentDOM.textContent).toContain("---");
  });

  it("draws bullets for unordered list marks except on the selected line", () => {
    const doc = "start\n\n- one\n- two";
    const view = mountEditor(doc, doc.indexOf("two"));

    expect(view.contentDOM.querySelectorAll(".cm-md-bullet")).toHaveLength(1);
    expect(view.contentDOM.textContent).toContain("- two");
    expect(view.contentDOM.textContent).not.toContain("- one");
  });

  it("styles ordered list numbers without hiding them", () => {
    const view = mountEditor("start\n\n1. one\n2. two", 0);

    expect(Array.from(view.contentDOM.querySelectorAll(".cm-md-list-number"), (mark) => mark.textContent)).toEqual([
      "1.",
      "2.",
    ]);
  });

  it("replaces task list marks and markers with checkboxes", () => {
    const view = mountEditor("start\n\n- [ ] todo\n- [x] done", 0);
    const checkboxes = view.contentDOM.querySelectorAll(".cm-md-task-checkbox");

    expect(Array.from(checkboxes, (checkbox) => checkbox.getAttribute("aria-label"))).toEqual(["Not done", "Done"]);
    expect(view.contentDOM.textContent).not.toContain("- [");
  });

  it("shows a task's raw syntax while the selection is on its line", () => {
    const doc = "start\n\n- [ ] todo";
    const view = mountEditor(doc, doc.indexOf("todo"));

    expect(view.contentDOM.querySelector(".cm-md-task-checkbox")).toBeNull();
    expect(view.contentDOM.textContent).toContain("- [ ] todo");
  });

  it("toggles a task on a checkbox click as one undo step, leaving the cursor", () => {
    const view = mountEditor("start\n\n- [ ] todo", 0);

    view.dispatch({ changes: { from: 0, insert: "a " }, userEvent: "input.type" });
    view.contentDOM
      .querySelector(".cm-md-task-checkbox")
      ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));

    expect(view.state.doc.toString()).toBe("a start\n\n- [x] todo");
    expect(view.state.selection.main.head).toBe(0);

    undo(view);

    expect(view.state.doc.toString()).toBe("a start\n\n- [ ] todo");
  });

  it("hides a code block's fences and info string outside the selection", () => {
    const view = mountEditor("start\n\n```text\nconst a = 1;\n```\n\nend", 0);

    expect(view.contentDOM.querySelector(".cm-md-code-fence-open")?.textContent).toBe("");
    expect(view.contentDOM.querySelector(".cm-md-code-line")?.textContent).toBe("const a = 1;");
    expect(view.contentDOM.querySelector(".cm-md-code-fence-close")?.textContent).toBe("");
    expect(view.contentDOM.querySelector(".cm-md-code-copy")).not.toBeNull();
  });

  it("shows a code block's fences while the selection is inside it", () => {
    const doc = "start\n\n```text\nconst a = 1;\n```";
    const view = mountEditor(doc, doc.indexOf("const"));

    expect(view.contentDOM.querySelector(".cm-md-code-fence-open")?.textContent).toBe("```text");
    expect(view.contentDOM.querySelector(".cm-md-code-fence-close")?.textContent).toBe("```");
    expect(view.contentDOM.querySelector(".cm-md-code-copy")).toBeNull();
  });

  it("classes a named language's tokens once its grammar loads", async () => {
    const view = mountEditor("start\n\n```js\nconst answer = 42;\n```", 0);

    await vi.waitFor(() => {
      expect(view.contentDOM.querySelector(".cm-md-code-line .tok-keyword")?.textContent).toBe("const");
    });
    expect(view.contentDOM.querySelector(".cm-md-code-line .tok-number")?.textContent).toBe("42");
  });

  it("extracts only the code between the fences", () => {
    expect(extractFencedCode("```ts\none\ntwo\n```")).toBe("one\ntwo");
    expect(extractFencedCode("```\n```")).toBe("");
    expect(extractFencedCode("```\nopen")).toBe("open");
  });

  it("draws a quote bar per nesting depth and hides the quote marks", () => {
    const view = mountEditor("start\n\n> outer\n> > inner\nlazy", 0);
    const quoteLines = view.contentDOM.querySelectorAll<HTMLElement>(".cm-md-blockquote");

    expect(Array.from(quoteLines, (line) => line.style.getPropertyValue("--md-quote-depth"))).toEqual(["1", "2", "2"]);
    expect(Array.from(quoteLines, (line) => line.textContent)).toEqual(["outer", "inner", "lazy"]);
  });

  it("shows a quote's raw syntax while the selection is anywhere inside it", () => {
    const doc = "start\n\n> outer\n> > inner";
    const view = mountEditor(doc, doc.indexOf("inner"));

    expect(view.contentDOM.querySelector(".cm-md-blockquote")).toBeNull();
    expect(view.contentDOM.textContent).toContain("> outer");
  });

  it("marks trailing tags", () => {
    const view = mountEditor("start\n\n#alpha #beta", 0);

    expect(Array.from(view.contentDOM.querySelectorAll(".cm-md-tag"), (tag) => tag.textContent)).toEqual([
      "#alpha",
      "#beta",
    ]);
  });
});
