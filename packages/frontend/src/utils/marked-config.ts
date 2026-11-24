import { Marked, Renderer, type Tokens, type TokenizerAndRendererExtension } from "marked";
import { sanitizeHtml } from "./html-sanitizer";
import {
  escapeHtml,
  hashtagExtension,
  HTMLVIEW_FENCE_LANG,
  isHashtagToken,
  isWikilinkToken,
  MARKDOWN_TAG_CLASS,
  MARKDOWN_WIKILINK_CLASS,
  MARKDOWN_WIKILINK_TARGET_ATTRIBUTE,
  taglineExtension,
  wikilinkExtension,
  WIKILINK_TOKEN,
  TAG_TOKEN,
} from "@crow-central-agency/shared";
import type { LexedMarkdown, TextMark, TokenMarks } from "./marked-config.types";

export const FIND_MATCH_CLASS = "find-match";
export const FIND_CURRENT_CLASS = "find-current";

type MarkedRenderer = Renderer;
const renderDefaultTable = Renderer.prototype.table;
const CODE_LANGUAGE_PATTERN = /^\S*/;
const ENDING_NEWLINE_PATTERN = /\n$/;

// Custom code-block renderer covering mermaid diagrams and htmlview embeds.
const codeBlockExtension: TokenizerAndRendererExtension = {
  name: "code",
  level: "block",
  renderer(token) {
    if (token.lang === "mermaid") {
      return `<div class="mermaid-container">${escapeHtml(token.text)}</div>`;
    }

    if (token.lang === HTMLVIEW_FENCE_LANG) {
      return `<div class="htmlview-container"><div class="htmlview-embed"><template class="htmlview-source">${escapeHtml(token.text)}</template></div></div>`;
    }

    // Fall back to default renderer for other code blocks
    return false;
  },
};

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Custom renderers: wrap tables in a scroll container; open links in a new tab
const renderer = {
  table(this: MarkedRenderer, token: Tokens.Table): string {
    return `<div class="markdown-table-scroll">${renderDefaultTable.call(this, token)}</div>`;
  },

  link(
    this: { parser: { parseInline: (tokens: Tokens.Generic[]) => string } },
    { href, title, tokens }: Tokens.Link
  ): string {
    const text = this.parser.parseInline(tokens);
    const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
    return `<a href="${escapeAttr(href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  },
};

const markedOptions = {
  gfm: true,
  breaks: true,
  extensions: [codeBlockExtension, taglineExtension, hashtagExtension, wikilinkExtension],
  renderer,
};

const markedInstance = new Marked(markedOptions);

function markText(text: string, marks: TextMark[]): string {
  let html = "";
  let offset = 0;

  for (const mark of marks) {
    const markClass = mark.isCurrent ? FIND_CURRENT_CLASS : FIND_MATCH_CLASS;
    html += `${escapeHtml(text.slice(offset, mark.start))}<mark class="${markClass}">${escapeHtml(text.slice(mark.start, mark.end))}</mark>`;
    offset = mark.end;
  }

  return html + escapeHtml(text.slice(offset));
}

/** The default renderers, except that a token holding marks writes them around its matched text */
function createMarkingInstance(marks: TokenMarks): Marked {
  const instance = new Marked(markedOptions);

  instance.use({
    renderer: {
      text(token) {
        const tokenMarks = marks.get(token);
        return tokenMarks ? markText(token.text, tokenMarks) : false;
      },
      codespan(token) {
        const tokenMarks = marks.get(token);
        return tokenMarks ? `<code>${markText(token.text, tokenMarks)}</code>` : false;
      },
    },
    extensions: [
      {
        name: "code",
        level: "block",
        renderer(token) {
          const tokenMarks = marks.get(token);
          if (!tokenMarks || typeof token.text !== "string") {
            return false;
          }

          const language = typeof token.lang === "string" ? token.lang.match(CODE_LANGUAGE_PATTERN)?.[0] : undefined;
          const languageClass = language ? ` class="language-${escapeHtml(language)}"` : "";
          const code = markText(token.text.replace(ENDING_NEWLINE_PATTERN, ""), tokenMarks);

          return `<pre><code${languageClass}>${code}\n</code></pre>\n`;
        },
      },
      {
        name: WIKILINK_TOKEN,
        level: "inline",
        renderer(token) {
          const tokenMarks = marks.get(token);
          if (!tokenMarks || !isWikilinkToken(token) || token.isEmbed) {
            return false;
          }

          return `<span class="${MARKDOWN_WIKILINK_CLASS}" ${MARKDOWN_WIKILINK_TARGET_ATTRIBUTE}="${escapeHtml(token.target)}">${markText(token.target, tokenMarks)}</span>`;
        },
      },
      {
        name: TAG_TOKEN.HASHTAG,
        level: "inline",
        renderer(token) {
          const tokenMarks = marks.get(token);
          if (!tokenMarks || !isHashtagToken(token)) {
            return false;
          }

          return `<span class="${MARKDOWN_TAG_CLASS}">${markText(`#${token.text}`, tokenMarks)}</span>`;
        },
      },
    ],
  });

  return instance;
}

/**
 * Lex markdown content once, collecting the wikilink targets it holds
 */
export function lexMarkdown(content: string): LexedMarkdown {
  const tokens = markedInstance.lexer(content);
  const targets = new Set<string>();

  markedInstance.walkTokens(tokens, (token) => {
    if (isWikilinkToken(token)) {
      targets.add(token.target);
    }
  });

  return { tokens, wikilinkTargets: Array.from(targets).sort() };
}

/**
 * Render lexed markdown to sanitized HTML, writing any find marks into the text they cover
 */
export function renderMarkdown(lexed: LexedMarkdown, marks?: TokenMarks): string {
  const instance = marks && marks.size > 0 ? createMarkingInstance(marks) : markedInstance;

  return sanitizeHtml(instance.parser(lexed.tokens));
}
