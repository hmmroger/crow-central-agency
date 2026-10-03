import { WidgetType } from "@codemirror/view";

const DIVIDER_CLASS = "cm-md-hr";

/** Stands in for a horizontal rule (`---`, `***`, `___`). */
export class DividerWidget extends WidgetType {
  public eq(): boolean {
    return true;
  }

  public toDOM(): HTMLElement {
    const divider = document.createElement("hr");
    divider.className = DIVIDER_CLASS;

    return divider;
  }
}
