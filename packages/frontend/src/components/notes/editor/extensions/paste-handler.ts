import type { Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { convertHtmlToMarkdown, hasMarkdownStructure, sanitizePastedHtml } from "./html-to-markdown.js";

const HTML_MIME_TYPE = "text/html";
const PLAIN_TEXT_MIME_TYPE = "text/plain";
const SHIFT_KEY = "Shift";
const PASTE_USER_EVENT = "input.paste";

function insertMarkdown(view: EditorView, markdown: string): void {
  view.dispatch(view.state.replaceSelection(markdown), { userEvent: PASTE_USER_EVENT, scrollIntoView: true });
}

/**
 * Pasted HTML is sanitized and converted to markdown; plain text, and HTML that
 * only carries styling, goes through CodeMirror's own paste untouched. A ClipboardEvent has no `shiftKey`, so
 * Shift is tracked from key events to let Shift-paste prefer plain text.
 */
class PastePlugin {
  public isShiftHeld = false;

  public handlePaste(event: ClipboardEvent, view: EditorView): boolean {
    const clipboard = event.clipboardData;

    if (!clipboard) {
      return false;
    }

    const html = clipboard.getData(HTML_MIME_TYPE);
    const plainText = clipboard.getData(PLAIN_TEXT_MIME_TYPE);

    if (!html || (this.isShiftHeld && plainText)) {
      return false;
    }

    const sanitizedHtml = sanitizePastedHtml(html);

    if (plainText && !hasMarkdownStructure(sanitizedHtml)) {
      return false;
    }

    const markdown = convertHtmlToMarkdown(sanitizedHtml);

    if (!markdown.trim()) {
      return false;
    }

    event.preventDefault();
    insertMarkdown(view, markdown);

    return true;
  }
}

export function pasteHandler(): Extension {
  return ViewPlugin.fromClass(PastePlugin, {
    eventHandlers: {
      keydown(event) {
        if (event.key === SHIFT_KEY) {
          this.isShiftHeld = true;
        }
      },
      keyup(event) {
        if (event.key === SHIFT_KEY) {
          this.isShiftHeld = false;
        }
      },
      blur() {
        this.isShiftHeld = false;
      },
      paste(event, view) {
        return this.handlePaste(event, view);
      },
    },
  });
}
