import type { TranslatorConfigFactory, TranslatorConfigObject } from "node-html-markdown";

const ZERO_WIDTH_CODE_POINTS = [0x200b, 0x200c, 0x200d, 0xfeff];
const ZERO_WIDTH_PATTERN = new RegExp(
  ZERO_WIDTH_CODE_POINTS.map((codePoint) => String.fromCodePoint(codePoint)).join("|"),
  "g"
);
const LINE_BREAK_PATTERN = /(?:\r\n|\r|\n)+/g;
const DESTINATION_UNSAFE_PATTERN = /[()_*]/g;
const TITLE_ESCAPE_PATTERN = /[\\"]/g;

/** Parentheses would end the destination early, and NHM would backslash-escape `_` and `*` inside it. */
function encodeLinkDestination(href: string): string {
  return href.replace(
    DESTINATION_UNSAFE_PATTERN,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function formatTitle(title: string | null | undefined): string {
  return title ? ` "${title.replace(LINE_BREAK_PATTERN, " ").replace(TITLE_ESCAPE_PATTERN, "\\$&")}"` : "";
}

function joinLines({ content }: { content: string }): string {
  return content.replace(LINE_BREAK_PATTERN, " ");
}

/**
 * Anchors become `<url>` when the text is the URL itself and `[text](url)`
 * otherwise. An anchor without an href keeps its text; one without visible
 * text is dropped.
 */
const translateAnchor: TranslatorConfigFactory = ({ node, visitor }) => {
  const href = node.getAttribute("href");

  if (!href) {
    return {};
  }

  const text = (node.textContent ?? "").replace(ZERO_WIDTH_PATTERN, "").trim();

  if (!text) {
    return { content: "", recurse: false };
  }

  const destination = encodeLinkDestination(href);

  if (text === href) {
    return { content: `<${destination}>` };
  }

  return {
    childTranslators: visitor.instance.aTagTranslators,
    prefix: "[",
    postfix: `](${destination}${formatTitle(node.getAttribute("title"))})`,
    postprocess: joinLines,
  };
};

export function getAnchorCustomTranslator(): TranslatorConfigObject {
  return { a: translateAnchor };
}
