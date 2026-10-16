import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { parseMarkdown } from "../../../utils/marked-config";
import { renderMermaidDiagram } from "../../../utils/mermaid-render";
import { useWikilinkResolveQuery } from "../../../hooks/queries/use-wikilink-resolve-query";
import { useAppStore } from "../../../stores/app-store";
import { readHtmlviewSource, renderHtmlviews } from "./markdown-htmlview-renderer";
import { renderMarkdownWikilinks } from "./markdown-wikilink-renderer";
import { HtmlviewEmbedDialog } from "../dialogs/htmlview-embed-dialog";
import { useOptionalModalDialog } from "../../../providers/modal-dialog-provider";
import { cn } from "../../../utils/cn";
import { createMermaidViewport } from "./mermaid-viewport";
import { useMermaidViewport } from "./use-mermaid-viewport";

const HTMLVIEW_COPY_ACTION = "copy";
const HTMLVIEW_EXPAND_ACTION = "expand";

const HTMLVIEW_CHROME = [
  `<div class="htmlview-chrome">`,
  `<button type="button" class="htmlview-btn" data-htmlview-action="${HTMLVIEW_COPY_ACTION}" aria-label="Copy source">Copy</button>`,
  `<button type="button" class="htmlview-btn" data-htmlview-action="${HTMLVIEW_EXPAND_ACTION}" aria-label="Expand view">Expand</button>`,
  `</div>`,
].join("");

interface MarkdownRendererProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
}

/**
 * Renders markdown content with mermaid diagram support
 */
export function MarkdownRenderer({ content, className, isStreaming }: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useMermaidViewport(containerRef);
  // Optional: MarkdownRenderer is general-purpose and may render outside a
  // ModalDialogProvider. When absent, showDialog is undefined and the expand
  // affordance degrades to a no-op. Reading the method out keeps the click
  // handler's dep a stable identifier (the provider's useCallback([],[])) rather
  // than the context object, which is recreated on every dialog stack mutation.
  const showDialog = useOptionalModalDialog()?.showDialog;

  // Memoize parsed HTML with copy buttons and embed chrome injected
  const parsed = useMemo(() => parseMarkdown(content), [content]);
  const html = useMemo(() => injectHtmlviewChrome(injectCopyButtons(parsed.html)), [parsed]);
  const [renderedHtml, setRenderedHtml] = useState(html);
  const { data: resolutions } = useWikilinkResolveQuery(parsed.wikilinkTargets);
  const goToNote = useAppStore((state) => state.goToNote);
  const innerHtml = useMemo(() => ({ __html: renderedHtml }), [renderedHtml]);

  // Render mermaid diagrams after mount (skip during streaming)
  useEffect(() => {
    const container = containerRef.current;
    if (isStreaming || !container) {
      setRenderedHtml(html);
      return;
    }

    const hasPendingMermaid = container.querySelectorAll(".mermaid-container:not([data-rendered])").length;
    if (!hasPendingMermaid) {
      setRenderedHtml(html);
      return;
    }

    const mermaidContainers = container.querySelectorAll(".mermaid-container");
    const renderDiagrams = async () => {
      await Promise.all(
        Array.from(mermaidContainers).map(async (el, index) => {
          const source = el.textContent || "";
          const isRendered = !!el.getAttribute("data-rendered");
          if (source && !isRendered) {
            try {
              el.setAttribute("data-rendered", "true");
              const diagram = await renderMermaidDiagram(source);
              const currentContainers = containerRef.current?.querySelectorAll(".mermaid-container");
              if (currentContainers && currentContainers.length > index) {
                const postEl = currentContainers[index];
                postEl.setAttribute("data-rendered", "true");
                postEl.replaceChildren(createMermaidViewport(diagram));
              }
            } catch (error) {
              el.setAttribute("data-rendered", "true");
              const errorPre = document.createElement("pre");
              errorPre.className = "text-xs text-error";
              errorPre.textContent = `Mermaid Error: ${error}`;
              el.replaceChildren(errorPre);
            }
          }
        })
      );

      if (containerRef.current) {
        setRenderedHtml(containerRef.current?.innerHTML);
      }
    };

    renderDiagrams();
  }, [html, isStreaming]);

  // Mount htmlview embeds into shadow roots. Depends on renderedHtml (not html)
  // so it re-runs after the mermaid re-serialization rewrites the
  // container's innerHTML — that drops the (non-serialized) shadow root, and
  // this pass re-attaches from the escaped source preserved in light DOM.
  useEffect(() => {
    const container = containerRef.current;
    if (isStreaming || !container) {
      return;
    }

    renderHtmlviews(container);
  }, [renderedHtml, isStreaming]);

  // Same trigger as the embeds: re-run after the mermaid pass replaces the DOM.
  useEffect(() => {
    const container = containerRef.current;
    if (isStreaming || !container || !resolutions) {
      return;
    }

    return renderMarkdownWikilinks(container, resolutions, (note) => goToNote(note.id));
  }, [renderedHtml, isStreaming, resolutions, goToNote]);

  // Event delegation: handles code-copy and embed chrome buttons.
  const handleContainerClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;

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
            copyHtmlviewSource(htmlviewBtn, source);
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
      const text = code?.textContent ?? pre.textContent ?? "";

      navigator.clipboard
        .writeText(text)
        .then(() => {
          target.textContent = "Copied!";
          setTimeout(() => {
            target.textContent = "Copy";
          }, 2000);
        })
        .catch(() => {
          console.warn("Clipboard not available.");
        });
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
  return html.replace(
    /<pre([^>]*)>(\s*<code)/g,
    '<pre$1><button class="code-copy-btn" aria-label="Copy code to clipboard">Copy</button>$2'
  );
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

function copyHtmlviewSource(button: HTMLElement, source: string): void {
  navigator.clipboard
    .writeText(source)
    .then(() => {
      button.textContent = "Copied!";
      setTimeout(() => {
        button.textContent = "Copy";
      }, 2000);
    })
    .catch(() => {
      console.warn("Clipboard not available.");
    });
}
