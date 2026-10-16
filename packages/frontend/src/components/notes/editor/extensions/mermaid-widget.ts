import { renderMermaidDiagram } from "../../../../utils/mermaid-render.js";
import { FencePreviewWidget } from "./fence-preview-widget.js";

export const MERMAID_FENCE_LANG = "mermaid";

const ERROR_CLASS = "cm-md-mermaid-error";

function showError(container: HTMLElement, reason: unknown): void {
  container.classList.add(ERROR_CLASS);
  container.textContent = `Diagram error: ${reason instanceof Error ? reason.message : String(reason)}`;
}

/** A mermaid fence drawn as its diagram. */
export class MermaidWidget extends FencePreviewWidget {
  protected readonly previewClass = "cm-md-mermaid-preview";

  protected render(container: HTMLElement): void {
    renderMermaidDiagram(this.source).then(
      (diagram) => container.replaceChildren(diagram),
      (reason: unknown) => showError(container, reason)
    );
  }
}
