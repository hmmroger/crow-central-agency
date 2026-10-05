import { WidgetType } from "@codemirror/view";
import { createImageElement, releaseImageElements } from "../../../common/note-image/image-element.js";
import type { ImageContent } from "../../../common/note-image/image-element.types.js";

function toContentKey(content: ImageContent): string {
  if (typeof content === "string") {
    return `url:${content}`;
  }

  return content === undefined ? "missing" : `note:${content.id}:${content.updatedTimestamp}`;
}

/** An image, or a missing-image chip, standing in for its markdown; never revealed as text. */
export class ImageWidget extends WidgetType {
  private readonly key: string;

  constructor(
    private readonly source: string,
    private readonly content: ImageContent,
    private readonly label: string
  ) {
    super();
    this.key = toContentKey(content);
  }

  /** Source plus what it draws, so neither a cursor move nor an unrelated edit reloads the image. */
  public eq(other: ImageWidget): boolean {
    return other.source === this.source && other.key === this.key;
  }

  public ignoreEvent(event: Event): boolean {
    return event.type !== "mousedown";
  }

  public toDOM(): HTMLElement {
    return createImageElement(this.content, this.label);
  }

  public destroy(dom: HTMLElement): void {
    releaseImageElements(dom);
  }
}
