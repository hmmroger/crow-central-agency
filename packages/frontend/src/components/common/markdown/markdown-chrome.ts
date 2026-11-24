/** CSS draws a chrome control's label from this attribute, so the label never joins a text selection or a copy */
export const CHROME_LABEL_ATTRIBUTE = "data-chrome-label";

export const COPY_LABEL = "Copy";
const COPIED_LABEL = "Copied!";
const COPIED_FEEDBACK_MS = 2000;

export function setChromeLabel(element: HTMLElement, label: string): void {
  element.setAttribute(CHROME_LABEL_ATTRIBUTE, label);
}

/** A chrome control's label attribute, for HTML built as a string from a fixed label */
export function toChromeLabelAttribute(label: string): string {
  return `${CHROME_LABEL_ATTRIBUTE}="${label}"`;
}

/** Writes `text` to the clipboard and shows the copy button's confirmation for a moment */
export function copyWithFeedback(button: HTMLElement, text: string): void {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      setChromeLabel(button, COPIED_LABEL);
      setTimeout(() => setChromeLabel(button, COPY_LABEL), COPIED_FEEDBACK_MS);
    })
    .catch(() => {
      console.warn("Clipboard not available.");
    });
}
