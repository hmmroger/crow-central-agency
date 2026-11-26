import { escapeHtml } from "@crow-central-agency/shared";

/** CSS draws a chrome control's label from this attribute, so the label never joins a text selection or a copy */
export const CHROME_LABEL_ATTRIBUTE = "data-chrome-label";

export const COPY_LABEL = "Copy";
const COPIED_LABEL = "Copied!";
const ARIA_LABEL_ATTRIBUTE = "aria-label";
const COPIED_FEEDBACK_MS = 2000;

export function setChromeLabel(element: HTMLElement, label: string): void {
  element.setAttribute(CHROME_LABEL_ATTRIBUTE, label);
}

/** A chrome control's label attribute, for HTML built as a string */
export function toChromeLabelAttribute(label: string): string {
  return `${CHROME_LABEL_ATTRIBUTE}="${escapeHtml(label)}"`;
}

/**
 * Writes `text` to the clipboard and shows, and names, the copy button's confirmation for a moment.
 * A click while the confirmation shows is ignored, so the original name is always the one restored.
 */
export function copyWithFeedback(button: HTMLElement, text: string): void {
  const accessibleLabel = button.getAttribute(ARIA_LABEL_ATTRIBUTE);

  if (button.getAttribute(CHROME_LABEL_ATTRIBUTE) === COPIED_LABEL) {
    return;
  }

  navigator.clipboard
    .writeText(text)
    .then(() => {
      setChromeLabel(button, COPIED_LABEL);
      button.setAttribute(ARIA_LABEL_ATTRIBUTE, COPIED_LABEL);
      setTimeout(() => {
        setChromeLabel(button, COPY_LABEL);
        if (accessibleLabel !== null) {
          button.setAttribute(ARIA_LABEL_ATTRIBUTE, accessibleLabel);
        }
      }, COPIED_FEEDBACK_MS);
    })
    .catch(() => {
      console.warn("Clipboard not available.");
    });
}
