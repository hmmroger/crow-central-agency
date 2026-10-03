import { renderHtmlview } from "../../../common/markdown/markdown-htmlview-renderer.js";
import { FencePreviewWidget } from "./fence-preview-widget.js";

/** An htmlview fence drawn as its sanitized, shadow-isolated embed. */
export class HtmlviewWidget extends FencePreviewWidget {
  protected readonly previewClass = "cm-md-htmlview-preview";

  protected render(container: HTMLElement): void {
    renderHtmlview(container, this.source);
  }
}
