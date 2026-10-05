import { WidgetType } from "@codemirror/view";

export const TASK_CHECKBOX_CLASS = "cm-md-task-checkbox";

const CHECKED_CLASS = "cm-md-task-checked";
const CHECKED_LABEL = "Done";
const UNCHECKED_LABEL = "Not done";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const CHECK_MARK_PATH = "M4.5 8L7 10.5L11.5 5.5";

function createCheckboxIcon(isChecked: boolean): SVGSVGElement {
  const icon = document.createElementNS(SVG_NAMESPACE, "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");

  const circle = document.createElementNS(SVG_NAMESPACE, "circle");
  circle.setAttribute("cx", "8");
  circle.setAttribute("cy", "8");
  circle.setAttribute("r", "7");
  icon.append(circle);

  if (isChecked) {
    const checkMark = document.createElementNS(SVG_NAMESPACE, "path");
    checkMark.setAttribute("d", CHECK_MARK_PATH);
    icon.append(checkMark);
  }

  return icon;
}

/**
 * Stands in for a task marker (`[ ]` / `[x]`); a click on it is handled by the click handler.
 * It announces its state but not a checkbox role: keyboard users edit the revealed marker text instead.
 */
export class TaskCheckboxWidget extends WidgetType {
  constructor(private readonly isChecked: boolean) {
    super();
  }

  public eq(other: TaskCheckboxWidget): boolean {
    return other.isChecked === this.isChecked;
  }

  public ignoreEvent(event: Event): boolean {
    return event.type !== "mousedown";
  }

  public toDOM(): HTMLElement {
    const checkbox = document.createElement("span");
    checkbox.className = TASK_CHECKBOX_CLASS;
    checkbox.classList.toggle(CHECKED_CLASS, this.isChecked);
    checkbox.setAttribute("role", "img");
    checkbox.setAttribute("aria-label", this.isChecked ? CHECKED_LABEL : UNCHECKED_LABEL);
    checkbox.append(createCheckboxIcon(this.isChecked));

    return checkbox;
  }
}
