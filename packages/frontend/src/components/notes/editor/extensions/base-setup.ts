import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap, type Command, type KeyBinding } from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import { TagParser } from "./tag-parser.js";
import { WikilinkParser } from "./wikilink-parser.js";

export const EDITOR_ROOT_CLASS = "md-live-editor";

const insertSpacesToNextTabStop: Command = (view) => {
  const { state } = view;
  const head = state.selection.main.head;
  const column = head - state.doc.lineAt(head).from;
  const spaceCount = state.tabSize - (column % state.tabSize);

  view.dispatch(state.replaceSelection(" ".repeat(spaceCount)));

  return true;
};

const TAB_BINDING: KeyBinding = { key: "Tab", run: insertSpacesToNextTabStop };

/** Everything the editor needs regardless of which preview features are on. */
export function createBaseSetup(): Extension[] {
  return [
    EditorView.lineWrapping,
    EditorView.editorAttributes.of({ class: EDITOR_ROOT_CLASS }),
    history(),
    // Fenced code languages load on first use; tokens get `tok-*` classes that index.css colors.
    markdown({ base: markdownLanguage, codeLanguages: languages, extensions: [TagParser, WikilinkParser] }),
    syntaxHighlighting(classHighlighter),
    keymap.of([TAB_BINDING].concat(defaultKeymap, historyKeymap)),
  ];
}
