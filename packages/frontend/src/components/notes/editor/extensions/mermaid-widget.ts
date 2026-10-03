import { renderMermaidSvg } from "../../../../utils/mermaid-render.js";
import { FencePreviewWidget } from "./fence-preview-widget.js";

export const MERMAID_FENCE_LANG = "mermaid";

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

/** A mermaid fence drawn as its diagram. */
export class MermaidWidget extends FencePreviewWidget {
  protected readonly previewClass = "cm-md-mermaid-preview";

  protected render(container: HTMLElement): void {
    renderMermaidSvg(this.source).then(
      (svgMarkup) => showDiagram(container, svgMarkup),
      (reason: unknown) => showError(container, reason)
    );
  }
}
