import { WidgetType } from "@codemirror/view";

const BULLET_CLASS = "cm-md-bullet";
const BULLET_CHARACTER = "•";

/** Stands in for a bullet list mark (`-`, `*`, `+`). */
export class BulletWidget extends WidgetType {
  public eq(): boolean {
    return true;
  }

  public toDOM(): HTMLElement {
    const bullet = document.createElement("span");
    bullet.className = BULLET_CLASS;
    bullet.textContent = BULLET_CHARACTER;

    return bullet;
  }
}
