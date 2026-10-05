import { describe, expect, it } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState } from "@codemirror/state";
import {
  getHeadingLevel,
  getLink,
  getListKind,
  getSelectedText,
  insertDivider,
  isBlockquoteActive,
  isCodeBlockActive,
  isInlineFormatActive,
  removeLink,
  setLink,
  setParagraph,
  toggleBlockquote,
  toggleCodeBlock,
  toggleHeading,
  toggleInlineFormat,
  toggleList,
} from "./markdown-commands.js";
import { INLINE_FORMAT, LIST_KIND, type CommandTarget } from "./markdown-commands.types.js";

const CURSOR = "|";
const SELECTION_START = "{";
const SELECTION_END = "}";

/** Builds a state from text marking the cursor with `|` or the selection with `{` and `}`. */
function createState(markedDoc: string): EditorState {
  const cursor = markedDoc.indexOf(CURSOR);

  if (cursor >= 0) {
    return EditorState.create({
      doc: markedDoc.replace(CURSOR, ""),
      selection: EditorSelection.cursor(cursor),
      extensions: markdown({ base: markdownLanguage }),
    });
  }

  const anchor = markedDoc.indexOf(SELECTION_START);
  const head = markedDoc.indexOf(SELECTION_END) - SELECTION_START.length;

  return EditorState.create({
    doc: markedDoc.replace(SELECTION_START, "").replace(SELECTION_END, ""),
    selection: EditorSelection.single(anchor, head),
    extensions: markdown({ base: markdownLanguage }),
  });
}

/** Renders the state back in the same notation, so a test can assert text and selection together. */
function describeState(state: EditorState): string {
  const { from, to } = state.selection.main;
  const doc = state.doc.toString();

  if (from === to) {
    return doc.slice(0, from) + CURSOR + doc.slice(from);
  }

  return doc.slice(0, from) + SELECTION_START + doc.slice(from, to) + SELECTION_END + doc.slice(to);
}

function runCommand(markedDoc: string, command: (target: CommandTarget) => boolean): string {
  const state = createState(markedDoc);
  const target: CommandTarget = {
    state,
    dispatch: (transaction) => {
      target.state = transaction.state;
    },
  };

  command(target);

  return describeState(target.state);
}

describe("inline formats", () => {
  it("reports a format as active only inside its content", () => {
    expect(isInlineFormatActive(createState("a **bo|ld** b"), INLINE_FORMAT.BOLD)).toBe(true);
    expect(isInlineFormatActive(createState("a **|bold** b"), INLINE_FORMAT.BOLD)).toBe(true);
    expect(isInlineFormatActive(createState("a **bold|** b"), INLINE_FORMAT.BOLD)).toBe(true);
    expect(isInlineFormatActive(createState("a |**bold** b"), INLINE_FORMAT.BOLD)).toBe(false);
    expect(isInlineFormatActive(createState("a **bold**| b"), INLINE_FORMAT.BOLD)).toBe(false);
    expect(isInlineFormatActive(createState("a **bo|ld** b"), INLINE_FORMAT.ITALIC)).toBe(false);
  });

  it("sees a format that encloses another", () => {
    expect(isInlineFormatActive(createState("**a *b|* c**"), INLINE_FORMAT.BOLD)).toBe(true);
    expect(isInlineFormatActive(createState("**a *b|* c**"), INLINE_FORMAT.ITALIC)).toBe(true);
  });

  it("wraps the selection and keeps it selected", () => {
    expect(runCommand("a {word} b", (target) => toggleInlineFormat(target, INLINE_FORMAT.BOLD))).toBe("a **{word}** b");
    expect(runCommand("a {word} b", (target) => toggleInlineFormat(target, INLINE_FORMAT.INLINE_CODE))).toBe(
      "a `{word}` b"
    );
  });

  it("inserts an empty pair at a bare cursor", () => {
    expect(runCommand("a | b", (target) => toggleInlineFormat(target, INLINE_FORMAT.STRIKETHROUGH))).toBe("a ~~|~~ b");
  });

  it("unwraps the enclosing construct and keeps the cursor on the same text", () => {
    expect(runCommand("a **bo|ld** b", (target) => toggleInlineFormat(target, INLINE_FORMAT.BOLD))).toBe("a bo|ld b");
    expect(runCommand("a *{word}* b", (target) => toggleInlineFormat(target, INLINE_FORMAT.ITALIC))).toBe("a {word} b");
  });
});

describe("headings", () => {
  it("reads the heading level of the cursor's line", () => {
    expect(getHeadingLevel(createState("## Ti|tle"))).toBe(2);
    expect(getHeadingLevel(createState("Plain| text"))).toBeUndefined();
    expect(getHeadingLevel(createState("#tag|"))).toBeUndefined();
  });

  it("adds a heading prefix and moves the cursor past it", () => {
    expect(runCommand("|Title", (target) => toggleHeading(target, 2))).toBe("## |Title");
  });

  it("switches between heading levels", () => {
    expect(runCommand("# Ti|tle", (target) => toggleHeading(target, 3))).toBe("### Ti|tle");
  });

  it("turns a heading back into a paragraph when toggled at the same level", () => {
    expect(runCommand("## Ti|tle", (target) => toggleHeading(target, 2))).toBe("Ti|tle");
  });

  it("starts a heading on an empty line", () => {
    expect(runCommand("|", (target) => toggleHeading(target, 1))).toBe("# |");
  });

  it("applies to every selected line but skips blank ones", () => {
    expect(runCommand("{one\n\ntwo}", (target) => toggleHeading(target, 1))).toBe("# {one\n\n# two}");
  });

  it("decides a mixed multi-line toggle from the line holding the cursor", () => {
    expect(runCommand("{# one\ntwo}", (target) => toggleHeading(target, 1))).toBe("{# one\n# two}");
    expect(runCommand("{one\n# two}", (target) => toggleHeading(target, 1))).toBe("{one\ntwo}");
  });

  it("strips heading prefixes when set to a paragraph", () => {
    expect(runCommand("{# one\n### two}", setParagraph)).toBe("{one\ntwo}");
  });
});

describe("lists", () => {
  it("reads the kind of the cursor's list item", () => {
    expect(getListKind(createState("- it|em"))).toBe(LIST_KIND.BULLET);
    expect(getListKind(createState("1. it|em"))).toBe(LIST_KIND.ORDERED);
    expect(getListKind(createState("- [ ] it|em"))).toBe(LIST_KIND.TASK);
    expect(getListKind(createState("- one\n  - nes|ted"))).toBe(LIST_KIND.BULLET);
    expect(getListKind(createState("pla|in"))).toBeUndefined();
  });

  it("turns the selected lines into a list, skipping blank ones", () => {
    expect(runCommand("{one\n\ntwo}", (target) => toggleList(target, LIST_KIND.BULLET))).toBe("- {one\n\n- two}");
  });

  it("numbers an ordered list from one", () => {
    expect(runCommand("{one\ntwo}", (target) => toggleList(target, LIST_KIND.ORDERED))).toBe("1. {one\n2. two}");
  });

  it("switches an item between kinds and keeps its indentation", () => {
    expect(runCommand("- one\n  - tw|o", (target) => toggleList(target, LIST_KIND.TASK))).toBe("- one\n  - [ ] tw|o");
    expect(runCommand("- [x] do|ne", (target) => toggleList(target, LIST_KIND.ORDERED))).toBe("1. do|ne");
  });

  it("removes the list when toggled with the same kind", () => {
    expect(runCommand("{- one\n- two}", (target) => toggleList(target, LIST_KIND.BULLET))).toBe("{one\ntwo}");
    expect(runCommand("- [ ] to|do", (target) => toggleList(target, LIST_KIND.TASK))).toBe("to|do");
  });
});

describe("blocks", () => {
  it("quotes the selected lines as one quote, blank lines included", () => {
    expect(isBlockquoteActive(createState("> quo|te"))).toBe(true);
    expect(runCommand("{one\n\ntwo}", toggleBlockquote)).toBe("> {one\n> \n> two}");
  });

  it("removes one quote level", () => {
    expect(runCommand("{> one\n> > two}", toggleBlockquote)).toBe("{one\n> two}");
  });

  it("fences the selected lines as a code block", () => {
    expect(runCommand("{one\ntwo}", toggleCodeBlock)).toBe("```\n{one\ntwo}\n```");
    expect(runCommand("|", toggleCodeBlock)).toBe("```\n|\n```");
  });

  it("removes the fences around the cursor's code block", () => {
    expect(isCodeBlockActive(createState("```ts\nco|de\n```"))).toBe(true);
    expect(isCodeBlockActive(createState("co|de"))).toBe(false);
    expect(runCommand("a\n```ts\nco|de\n```\nb", toggleCodeBlock)).toBe("a\nco|de\nb");
    expect(runCommand("a\n```\n|\n```\nb", toggleCodeBlock)).toBe("a\n|\nb");
    expect(runCommand("a\n`|``\n```\nb", toggleCodeBlock)).toBe("a\n|\nb");
  });

  it("puts a divider below the line, apart from a paragraph above", () => {
    expect(runCommand("te|xt", insertDivider)).toBe("text\n\n---\n|");
    expect(runCommand("text\n|\nnext", insertDivider)).toBe("text\n\n---\n|\nnext");
    expect(runCommand("|", insertDivider)).toBe("---\n|");
  });

  it("reuses a blank line already below the divider", () => {
    expect(runCommand("te|xt\n\nafter", insertDivider)).toBe("text\n\n---\n|\nafter");
  });
});

describe("links", () => {
  it("reports the link's text and URL only strictly inside it", () => {
    expect(getLink(createState("see [*do*|cs](https://example.com)"))).toEqual({
      text: "*do*cs",
      url: "https://example.com",
    });
    expect(getLink(createState("see [x|](<https://example.com/a b>)"))).toEqual({
      text: "x",
      url: "https://example.com/a b",
    });
    expect(getLink(createState("see |[docs](https://example.com)"))).toBeUndefined();
    expect(getLink(createState("see [docs](https://example.com)|"))).toBeUndefined();
  });

  it("reports an autolink's URL as its text", () => {
    expect(getLink(createState("see <https://exa|mple.com>"))).toEqual({
      text: "https://example.com",
      url: "https://example.com",
    });
  });

  it("reports single-line selected text only", () => {
    expect(getSelectedText(createState("see {the docs} now"))).toBe("the docs");
    expect(getSelectedText(createState("see {the\ndocs} now"))).toBeUndefined();
    expect(getSelectedText(createState("see | now"))).toBeUndefined();
  });

  it("links the selected text with the given label", () => {
    expect(runCommand("see {the docs} now", (target) => setLink(target, "guide", "https://example.com"))).toBe(
      "see [guide](https://example.com)| now"
    );
  });

  it("falls back to the selected text when the label is blank", () => {
    expect(runCommand("see {the docs} now", (target) => setLink(target, " ", "https://example.com"))).toBe(
      "see [the docs](https://example.com)| now"
    );
  });

  it("inserts a link at an empty cursor, using the URL when the label is blank", () => {
    expect(runCommand("see |", (target) => setLink(target, "docs", "https://example.com"))).toBe(
      "see [docs](https://example.com)|"
    );
    expect(runCommand("see |", (target) => setLink(target, "", " https://example.com "))).toBe(
      "see [https://example.com](https://example.com)|"
    );
  });

  it("edits the label of the link at the cursor", () => {
    expect(
      runCommand("see [do|cs](https://example.com) now", (target) => setLink(target, "guide", "https://example.com"))
    ).toBe("see [guide](https://example.com)| now");
  });

  it("edits the URL of the link at the cursor", () => {
    expect(
      runCommand("see [do|cs](https://example.com) now", (target) => setLink(target, "docs", "https://example.org"))
    ).toBe("see [docs](https://example.org)| now");
  });

  it("keeps the title of the link it edits", () => {
    expect(
      runCommand('see [do|cs](https://example.com "Docs") now', (target) =>
        setLink(target, "guide", "https://example.org")
      )
    ).toBe('see [guide](https://example.org "Docs")| now');
  });

  it("rewrites an autolink as an inline link", () => {
    expect(
      runCommand("see <https://exa|mple.com> now", (target) => setLink(target, "docs", "https://example.com"))
    ).toBe("see [docs](https://example.com)| now");
  });

  it("wraps a destination with spaces or parentheses in angle brackets", () => {
    expect(runCommand("{x}", (target) => setLink(target, "", "https://example.com/a (b)"))).toBe(
      "[x](<https://example.com/a (b)>)|"
    );
  });

  it("escapes unbalanced brackets in the label", () => {
    expect(runCommand("{x}", (target) => setLink(target, "array[0 value", "https://example.com"))).toBe(
      "[array\\[0 value](https://example.com)|"
    );
  });

  it("does not double-escape a bracket the user already escaped", () => {
    expect(runCommand("{a\\[b] c}", (target) => setLink(target, "", "https://example.com"))).toBe(
      "[a\\[b\\] c](https://example.com)|"
    );
  });

  it("keeps balanced brackets in the label", () => {
    expect(runCommand("{x}", (target) => setLink(target, "see [x] here", "https://example.com"))).toBe(
      "[see [x] here](https://example.com)|"
    );
  });

  it("ignores a blank URL", () => {
    expect(runCommand("{x}", (target) => setLink(target, "docs", "  "))).toBe("{x}");
    expect(runCommand("see [do|cs](https://example.com)", (target) => setLink(target, "guide", ""))).toBe(
      "see [do|cs](https://example.com)"
    );
  });

  it("removes link syntax and keeps the visible text", () => {
    expect(runCommand("see [do|cs](https://example.com) now", removeLink)).toBe("see do|cs now");
    expect(runCommand("see <https://exa|mple.com> now", removeLink)).toBe("see https://exa|mple.com now");
  });
});
