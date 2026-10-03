import { WidgetType } from "@codemirror/view";
import { renderHtmlview } from "../../../common/markdown/markdown-htmlview-renderer.js";
import { FENCE_PREVIEW_CLASS } from "./fence-preview.types.js";

const HTMLVIEW_PREVIEW_CLASS = "cm-md-htmlview-preview";

/** An htmlview fence drawn as its sanitized, shadow-isolated embed; an unchanged source keeps its DOM. */
export class HtmlviewWidget extends WidgetType {
  constructor(private readonly source: string) {
    super();
  }

  public eq(other: HtmlviewWidget): boolean {
    return other.source === this.source;
  }

  public ignoreEvent(event: Event): boolean {
    return event.type !== "mousedown";
  }

  public toDOM(): HTMLElement {
    const host = document.createElement("div");
    host.className = `${FENCE_PREVIEW_CLASS} ${HTMLVIEW_PREVIEW_CLASS}`;
    renderHtmlview(host, this.source);

    return host;
  }
}
