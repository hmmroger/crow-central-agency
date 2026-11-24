import { useMemo, useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { FIND_CURRENT_CLASS, lexMarkdown, renderMarkdown } from "../../../utils/marked-config";
import { toTokenMarks } from "../find/markdown-find";
import type { MarkdownFindInput } from "../find/markdown-find.types";
import { renderMermaidDiagram } from "../../../utils/mermaid-render";
import { useWikilinkResolveQuery } from "../../../hooks/queries/use-wikilink-resolve-query";
import { useAppStore } from "../../../stores/app-store";
import { readHtmlviewSource, renderHtmlviews } from "./markdown-htmlview-renderer";
import { renderMarkdownWikilinks } from "./markdown-wikilink-renderer";
import { MarkdownDrawnBlocks } from "./markdown-drawn-blocks";
import { HtmlviewEmbedDialog } from "../dialogs/htmlview-embed-dialog";
import { useOptionalModalDialog } from "../../../providers/modal-dialog-provider";
import { cn } from "../../../utils/cn";
import { MermaidDiagramDialog } from "../dialogs/mermaid-diagram-dialog";
import {
  createMermaidViewport,
  MERMAID_EXPAND_BUTTON_SELECTOR,
  MERMAID_SVG_SELECTOR,
  MERMAID_VIEWPORT_SELECTOR,
} from "./mermaid-viewport";
import { useMermaidViewport } from "./use-mermaid-viewport";
import { COPY_LABEL, copyWithFeedback, toChromeLabelAttribute } from "./markdown-chrome";

const HTMLVIEW_COPY_ACTION = "copy";
const HTMLVIEW_EXPAND_ACTION = "expand";
const EXPAND_LABEL = "Expand";
const CODE_COPY_BUTTON = `<button class="code-copy-btn" aria-label="Copy code to clipboard" ${toChromeLabelAttribute(COPY_LABEL)}></button>`;

const HTMLVIEW_CHROME = [
  `<div class="htmlview-chrome">`,
  `<button type="button" class="htmlview-btn" data-htmlview-action="${HTMLVIEW_COPY_ACTION}" aria-label="Copy source" ${toChromeLabelAttribute(COPY_LABEL)}></button>`,
  `<button type="button" class="htmlview-btn" data-htmlview-action="${HTMLVIEW_EXPAND_ACTION}" aria-label="Expand view" ${toChromeLabelAttribute(EXPAND_LABEL)}></button>`,
  `</div>`,
].join("");

interface MarkdownRendererProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
  /** The content's find document and matches; its lexed tokens are rendered in place of `content` */
  find?: MarkdownFindInput;
}

/**
 * Renders markdown content with mermaid diagram support
 */
export function MarkdownRenderer({ content, className, isStreaming, find }: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useMermaidViewport(containerRef);
  // Optional: MarkdownRenderer is general-purpose and may render outside a
  // ModalDialogProvider. When absent, showDialog is undefined and the expand
  // affordance degrades to a no-op. Reading the method out keeps the click
  // handler's dep a stable identifier (the provider's useCallback([],[])) rather
  // than the context object, which is recreated on every dialog stack mutation.
  const showDialog = useOptionalModalDialog()?.showDialog;

  // Memoize parsed HTML with copy buttons and embed chrome injected
  const findDocument = find?.document;
  const findMatches = find?.matches;
  const currentMatchIndex = find?.currentIndex;
  const lexed = useMemo(() => findDocument?.lexed ?? lexMarkdown(content), [findDocument, content]);
  const marks = useMemo(
    () =>
      findDocument && findMatches ? toTokenMarks(findDocument.findText, findMatches, currentMatchIndex) : undefined,
    [findDocument, findMatches, currentMatchIndex]
  );
  const html = useMemo(() => injectHtmlviewChrome(injectCopyButtons(renderMarkdown(lexed, marks))), [lexed, marks]);
  const revealStep = find?.revealStep;
  const [drawnBlocks] = useState(() => new MarkdownDrawnBlocks());
  const { data: resolutions } = useWikilinkResolveQuery(lexed.wikilinkTargets);
  const goToNote = useAppStore((state) => state.goToNote);
  const innerHtml = useMemo(() => ({ __html: html }), [html]);

  // Before paint, so a recommitted page never shows its blocks undrawn.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (isStreaming || !container) {
      return;
    }

    drawnBlocks.restore(container);
    renderHtmlviews(container);
    for (const mermaidContainer of Array.from(
      container.querySelectorAll<HTMLElement>(".mermaid-container:not([data-rendered])")
    )) {
      void drawMermaid(mermaidContainer);
    }
  }, [html, isStreaming, drawnBlocks]);

  useEffect(() => () => drawnBlocks.release(), [drawnBlocks]);

  useEffect(() => {
    if (revealStep !== undefined) {
      containerRef.current?.querySelector(`.${FIND_CURRENT_CLASS}`)?.scrollIntoView({ block: "center" });
    }
  }, [revealStep]);

  useEffect(() => {
    const container = containerRef.current;
    if (isStreaming || !container || !resolutions) {
      return;
    }

    return renderMarkdownWikilinks(container, resolutions, drawnBlocks.embedResolutions, (note) => goToNote(note.id));
  }, [html, isStreaming, resolutions, goToNote, drawnBlocks]);

  // Event delegation: handles code-copy, mermaid expand and embed chrome buttons.
  const handleContainerClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;

      // The dialog gets a copy of the rendered SVG, so the inline diagram is left untouched.
      const expandBtn = target.closest(MERMAID_EXPAND_BUTTON_SELECTOR);
      if (expandBtn) {
        const svg = expandBtn.closest(MERMAID_VIEWPORT_SELECTOR)?.querySelector(MERMAID_SVG_SELECTOR);
        if (svg) {
          showDialog?.({
            id: `mermaid-expand-${Date.now()}`,
            component: MermaidDiagramDialog,
            componentProps: { svg: svg.cloneNode(true) },
            title: "Diagram",
            className: "w-[95vw] h-[90vh] flex flex-col",
          });
        }

        return;
      }

      const htmlviewBtn = target.closest<HTMLElement>(".htmlview-btn");
      if (htmlviewBtn) {
        // Copy the authored source (what the agent wrote), not the sanitized
        // shadow output; expand renders the same embed larger via the dialog.
        const container = htmlviewBtn.closest<HTMLElement>(".htmlview-container");
        const source = container ? readHtmlviewSource(container) : "";
        if (source) {
          if (htmlviewBtn.dataset.htmlviewAction === HTMLVIEW_EXPAND_ACTION) {
            showDialog?.({
              id: `htmlview-expand-${Date.now()}`,
              component: HtmlviewEmbedDialog,
              componentProps: { source },
              title: "HTML view",
              className: "w-[95vw] lg:w-4xl 2xl:w-7xl h-[80vh] flex flex-col",
            });
          } else {
            copyWithFeedback(htmlviewBtn, source);
          }
        }

        return;
      }

      if (!target.classList.contains("code-copy-btn")) {
        return;
      }

      const pre = target.closest("pre");
      if (!pre) {
        return;
      }

      const code = pre.querySelector("code");
      copyWithFeedback(target, code?.textContent ?? pre.textContent ?? "");
    },
    [showDialog]
  );

  return (
    <div
      ref={containerRef}
      className={cn("markdown-content", className)}
      dangerouslySetInnerHTML={innerHtml}
      onClick={handleContainerClick}
    />
  );
}

/**
 * Inject copy-button HTML into <pre><code> blocks so buttons
 * are part of the rendered string and survive React re-renders.
 */
function injectCopyButtons(html: string): string {
  return html.replace(/<pre([^>]*)>(\s*<code)/g, `<pre$1>${CODE_COPY_BUTTON}$2`);
}

/**
 * Prepend host chrome before each embed as a preceding sibling of the shadow
 * host, so it renders (shadow-host light children do not) as an always-visible
 * header strip above the content box. The escaped source cannot contain a
 * literal `</template>`, so the lazy match ends exactly at the embed's tags.
 */
function injectHtmlviewChrome(html: string): string {
  return html.replace(
    /(<div class="htmlview-embed"><template class="htmlview-source">[\s\S]*?<\/template><\/div>)/g,
    `${HTMLVIEW_CHROME}$1`
  );
}

async function drawMermaid(mermaidContainer: HTMLElement): Promise<void> {
  const source = mermaidContainer.textContent ?? "";
  if (!source) {
    return;
  }

  mermaidContainer.setAttribute("data-rendered", "true");
  try {
    mermaidContainer.replaceChildren(createMermaidViewport(await renderMermaidDiagram(source), true));
  } catch (error) {
    const errorPre = document.createElement("pre");
    errorPre.className = "text-xs text-error";
    errorPre.textContent = `Mermaid Error: ${error}`;
    mermaidContainer.replaceChildren(errorPre);
  }
}
