import { WidgetType } from "@codemirror/view";
import { renderMermaidSvg } from "../../../../utils/mermaid-render.js";
import { FENCE_PREVIEW_CLASS } from "./fence-preview.types.js";

export const MERMAID_FENCE_LANG = "mermaid";

const MERMAID_PREVIEW_CLASS = "cm-md-mermaid-preview";

const ERROR_CLASS = "cm-md-mermaid-error";
const SVG_MIME_TYPE = "image/svg+xml";
const NOT_SVG_MESSAGE = "the renderer did not return an SVG";

function showError(container: HTMLElement, reason: unknown): void {
  container.classList.add(ERROR_CLASS);
  container.textContent = `Diagram error: ${reason instanceof Error ? reason.message : String(reason)}`;
}

/** Inserts the markup only if it parses as a single SVG element. */
function showDiagram(container: HTMLElement, svgMarkup: string): void {
  const { documentElement } = new DOMParser().parseFromString(svgMarkup, SVG_MIME_TYPE);

  if (documentElement instanceof SVGSVGElement) {
    container.replaceChildren(document.importNode(documentElement, true));
  } else {
    showError(container, NOT_SVG_MESSAGE);
  }
}

/** A rendered diagram standing in for its fence; an unchanged source keeps its rendered DOM. */
export class MermaidWidget extends WidgetType {
  constructor(private readonly source: string) {
    super();
  }

  public eq(other: MermaidWidget): boolean {
    return other.source === this.source;
  }

  public ignoreEvent(event: Event): boolean {
    return event.type !== "mousedown";
  }

  public toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = `${FENCE_PREVIEW_CLASS} ${MERMAID_PREVIEW_CLASS}`;

    renderMermaidSvg(this.source).then(
      (svgMarkup) => showDiagram(container, svgMarkup),
      (reason: unknown) => showError(container, reason)
    );

    return container;
  }
}
