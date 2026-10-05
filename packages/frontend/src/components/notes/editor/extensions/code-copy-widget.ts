import { WidgetType, type EditorView } from "@codemirror/view";
import { findSyntaxAncestor } from "./cm-extension-utils.js";
import { getFencedCodeText } from "./markdown-syntax.js";
import { SYNTAX_NODE } from "./markdown-syntax.types.js";

const COPY_BUTTON_CLASS = "cm-md-code-copy";
const COPIED_CLASS = "cm-md-code-copied";
const COPY_LABEL = "Copy code";
const COPIED_FEEDBACK_MS = 2000;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const COPY_ICON_PATH = "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1";
const COPY_ICON_RECT = { x: "9", y: "9", width: "13", height: "13", rx: "2" };
const CHECK_ICON_PATH = "M20 6 9 17l-5-5";

function createIcon(isCopied: boolean): SVGSVGElement {
  const icon = document.createElementNS(SVG_NAMESPACE, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");

  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", isCopied ? CHECK_ICON_PATH : COPY_ICON_PATH);
  icon.append(path);

  if (!isCopied) {
    const rect = document.createElementNS(SVG_NAMESPACE, "rect");
    Object.entries(COPY_ICON_RECT).forEach(([name, value]) => rect.setAttribute(name, value));
    icon.append(rect);
  }

  return icon;
}

function showCopied(button: HTMLButtonElement, isCopied: boolean): void {
  button.classList.toggle(COPIED_CLASS, isCopied);
  button.replaceChildren(createIcon(isCopied));
}

/** Reads the code when clicked, so the widget never has to track the block's text. */
function copyCode(view: EditorView, button: HTMLButtonElement): void {
  const fencedCode = findSyntaxAncestor(view.state, view.posAtDOM(button), SYNTAX_NODE.FENCED_CODE);

  // Absent outside secure contexts, even though the DOM typings declare it.
  if (!fencedCode || !("clipboard" in navigator)) {
    return;
  }

  navigator.clipboard.writeText(getFencedCodeText(view.state, fencedCode)).then(
    () => {
      showCopied(button, true);
      setTimeout(showCopied, COPIED_FEEDBACK_MS, button, false);
    },
    () => undefined
  );
}

/** Copy button on a fenced code block's opening line. */
export class CodeCopyWidget extends WidgetType {
  public eq(): boolean {
    return true;
  }

  public toDOM(view: EditorView): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = COPY_BUTTON_CLASS;
    button.title = COPY_LABEL;
    button.setAttribute("aria-label", COPY_LABEL);
    button.append(createIcon(false));
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => copyCode(view, button));

    return button;
  }
}
