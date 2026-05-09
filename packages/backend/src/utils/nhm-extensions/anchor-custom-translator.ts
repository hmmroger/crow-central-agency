import { PostProcessResult, type TranslatorConfigObject } from "node-html-markdown";

/**
 * Characters that need percent-encoding in markdown link URLs to avoid being
 * interpreted as markdown syntax. Mirrors node-html-markdown's default anchor
 * behavior so output remains compatible.
 */
const HREF_ENCODING_MAP: Record<string, string> = {
  "(": "%28",
  ")": "%29",
  _: "%5F",
  "*": "%2A",
};

/**
 * Override for the default `a` translator that drops links whose visible text
 * is empty after trimming (e.g. `<a href="...">[whitespace or now-empty img alt]</a>`).
 */
export function getAnchorCustomTranslator(): TranslatorConfigObject {
  return {
    a: ({ node, options, visitor }) => {
      const href = node.getAttribute("href");
      if (!href) {
        return {};
      }

      const encodedHref = encodeMarkdownHref(href);
      const title = node.getAttribute("title");

      if (node.textContent === href && options.useInlineLinks) {
        return { content: `<${encodedHref}>` };
      }

      return {
        childTranslators: visitor.instance.aTagTranslators,
        postprocess: ({ content }) => {
          const trimmed = content.replace(/(?:\r?\n)+/g, " ").trim();
          if (trimmed.length === 0) {
            return PostProcessResult.RemoveNode;
          }

          const titleSuffix = title ? ` "${title}"` : "";
          return `[${trimmed}](${encodedHref}${titleSuffix})`;
        },
      };
    },
  };
}

function encodeMarkdownHref(href: string): string {
  let encoded = "";
  for (const chr of href) {
    encoded += HREF_ENCODING_MAP[chr] ?? chr;
  }

  return encoded;
}
