import { WidgetType } from "@codemirror/view";
import { createImageElement, releaseImageElements } from "../../../../utils/note-image/image-element.js";
import { getResolvedImageKey } from "../../../../utils/note-image/resolved-image.js";
import type { ResolvedImage } from "../../../../utils/note-image/resolved-image.types.js";

/** An image, or a missing-image chip, standing in for its markdown; never revealed as text. */
export class ImageWidget extends WidgetType {
  private readonly key: string;

  constructor(
    private readonly source: string,
    private readonly resolved: ResolvedImage
  ) {
    super();
    this.key = getResolvedImageKey(resolved);
  }

  /** Source plus what it resolves to, so neither a cursor move nor an unrelated edit reloads the image. */
  public eq(other: ImageWidget): boolean {
    return other.source === this.source && other.key === this.key;
  }

  public ignoreEvent(event: Event): boolean {
    return event.type !== "mousedown";
  }

  public toDOM(): HTMLElement {
    return createImageElement(this.resolved);
  }

  public destroy(dom: HTMLElement): void {
    releaseImageElements(dom);
  }
}
