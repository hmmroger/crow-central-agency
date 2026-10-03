import { WidgetType } from "@codemirror/view";

/** Every fence preview carries it, so a click on any of them selects the fence's source */
export const FENCE_PREVIEW_CLASS = "cm-md-fence-preview";

/** A rendered fence standing in for its source; an unchanged source keeps its rendered DOM. */
export abstract class FencePreviewWidget extends WidgetType {
  protected abstract readonly previewClass: string;

  constructor(protected readonly source: string) {
    super();
  }

  public eq(other: FencePreviewWidget): boolean {
    return other.source === this.source;
  }

  public ignoreEvent(event: Event): boolean {
    return event.type !== "mousedown";
  }

  public toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = `${FENCE_PREVIEW_CLASS} ${this.previewClass}`;
    this.render(container);

    return container;
  }

  protected abstract render(container: HTMLElement): void;
}
