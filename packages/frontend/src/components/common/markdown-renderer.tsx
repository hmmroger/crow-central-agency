import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import mermaid from "mermaid";
import { ensureMermaidInit } from "../../utils/mermaid-config";
import { parseMarkdown } from "../../utils/marked-config";
import { sanitizeSvg } from "../../utils/html-sanitizer";
import { readEmbedSource, renderEmbedIntoHost } from "./htmlview-embed-mount";
import { HtmlviewEmbedDialog } from "./dialogs/htmlview-embed-dialog";
import { useOptionalModalDialog } from "../../providers/modal-dialog-provider";
import { cn } from "../../utils/cn";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;

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

interface PanDragState {
  viewport: HTMLElement;
  pointerId: number;
  startPointerX: number;
  startPointerY: number;
  startPanX: number;
  startPanY: number;
}

// Initialize mermaid with shared settings (called once, idempotent)
ensureMermaidInit();

/**
 * Renders markdown content with mermaid diagram support
 */
export function MarkdownRenderer({ content, className, isStreaming }: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<PanDragState | null>(null);
  // Optional: MarkdownRenderer is general-purpose and may render outside a
  // ModalDialogProvider. When absent, showDialog is undefined and the expand
  // affordance degrades to a no-op. Reading the method out keeps the click
  // handler's dep a stable identifier (the provider's useCallback([],[])) rather
  // than the context object, which is recreated on every dialog stack mutation.
  const showDialog = useOptionalModalDialog()?.showDialog;

  // Memoize parsed HTML with copy buttons and embed chrome injected
  const html = useMemo(() => injectHtmlviewChrome(injectCopyButtons(parseMarkdown(content))), [content]);
  const [renderedHtml, setRenderedHtml] = useState(html);
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
              const mermaidId = `mermaid-${Date.now()}-${index}`;
              el.setAttribute("data-rendered", "true");
              const { svg } = await mermaid.render(mermaidId, source);
              const currentContainers = containerRef.current?.querySelectorAll(".mermaid-container");
              if (currentContainers && currentContainers.length > index) {
                const postEl = currentContainers[index];
                postEl.innerHTML = sanitizeSvg(svg);
                postEl.setAttribute("data-rendered", "true");
                wrapMermaidAsViewport(postEl);
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
  // so it re-runs after the mermaid re-serialization at :85 rewrites the
  // container's innerHTML — that drops the (non-serialized) shadow root, and
  // this pass re-attaches from the escaped source preserved in light DOM.
  useEffect(() => {
    const container = containerRef.current;
    if (isStreaming || !container) {
      return;
    }

    mountHtmlviewEmbeds(container);
  }, [renderedHtml, isStreaming]);

  // Non-passive native wheel listener so Ctrl/Cmd+wheel can zoom without
  // scrolling the page. React's synthetic onWheel is passive.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const viewport = target?.closest<HTMLElement>(".mermaid-viewport");
      if (!viewport) {
        return;
      }

      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      zoomViewport(viewport, event.deltaY < 0 ? "in" : "out", {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  // Event delegation: handles code-copy, mermaid zoom, and embed chrome buttons.
  const handleContainerClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;

      const zoomBtn = target.closest<HTMLElement>(".mermaid-zoom-btn");
      if (zoomBtn) {
        const action = zoomBtn.dataset.zoomAction;
        const viewport = zoomBtn.closest<HTMLElement>(".mermaid-viewport");
        if (action && viewport) {
          zoomViewport(viewport, action);
        }

        return;
      }

      const htmlviewBtn = target.closest<HTMLElement>(".htmlview-btn");
      if (htmlviewBtn) {
        // Copy the authored source (what the agent wrote), not the sanitized
        // shadow output; expand renders the same embed larger via the dialog.
        const container = htmlviewBtn.closest<HTMLElement>(".htmlview-container");
        const source = container ? readEmbedSource(container) : "";
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

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const viewport = target.closest<HTMLElement>(".mermaid-viewport");
    if (!viewport) {
      return;
    }

    if (event.button !== 0 || target.closest(".mermaid-controls")) {
      return;
    }

    const { zoom, panX, panY } = readViewportState(viewport);
    if (zoom <= 1) {
      return;
    }

    viewport.setPointerCapture(event.pointerId);
    viewport.dataset.panning = "true";
    dragStateRef.current = {
      viewport,
      pointerId: event.pointerId,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startPanX: panX,
      startPanY: panY,
    };
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - drag.startPointerX;
    const dy = event.clientY - drag.startPointerY;
    drag.viewport.dataset.panX = String(drag.startPanX + dx);
    drag.viewport.dataset.panY = String(drag.startPanY + dy);
    applyViewportTransform(drag.viewport);
  }, []);

  const handlePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (drag.viewport.hasPointerCapture(event.pointerId)) {
      drag.viewport.releasePointerCapture(event.pointerId);
    }

    delete drag.viewport.dataset.panning;
    dragStateRef.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn("markdown-content", className)}
      dangerouslySetInnerHTML={innerHtml}
      onClick={handleContainerClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
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

/**
 * Render each embed's source into its shadow root. The mount is source-derived
 * (see htmlview-embed-mount): it re-renders whenever the live shadow is missing
 * or stale for the current source, so any remount or innerHTML re-serialization
 * self-heals from the inert <template> carrier that survives it.
 */
function mountHtmlviewEmbeds(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(".htmlview-embed").forEach((element) => {
    renderEmbedIntoHost(element, readEmbedSource(element));
  });
}

function createZoomButton(action: string, label: string, symbol: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mermaid-zoom-btn";
  button.dataset.zoomAction = action;
  button.setAttribute("aria-label", label);
  button.textContent = symbol;
  return button;
}

/**
 * Wrap an already-rendered mermaid SVG (child of `container`) with a
 * zoom/pan viewport and overlay controls. Uses DOM methods only — the SVG
 * was sanitized before being inserted via the container's innerHTML.
 */
function wrapMermaidAsViewport(container: Element) {
  const svg = container.firstElementChild;
  if (!svg) {
    return;
  }

  const viewport = document.createElement("div");
  viewport.className = "mermaid-viewport";
  viewport.dataset.zoom = "1";
  viewport.dataset.panX = "0";
  viewport.dataset.panY = "0";

  const stage = document.createElement("div");
  stage.className = "mermaid-stage";
  stage.appendChild(svg);

  const controls = document.createElement("div");
  controls.className = "mermaid-controls";
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", "Diagram zoom controls");
  controls.append(
    createZoomButton("out", "Zoom out", "−"),
    createZoomButton("reset", "Reset zoom", "↺"),
    createZoomButton("in", "Zoom in", "+")
  );

  viewport.append(stage, controls);
  container.replaceChildren(viewport);
}

function readViewportState(viewport: HTMLElement) {
  const zoom = Number(viewport.dataset.zoom) || 1;
  const panX = Number(viewport.dataset.panX) || 0;
  const panY = Number(viewport.dataset.panY) || 0;
  return { zoom, panX, panY };
}

function applyViewportTransform(viewport: HTMLElement) {
  const stage = viewport.querySelector<HTMLElement>(".mermaid-stage");
  if (!stage) {
    return;
  }

  const { zoom, panX, panY } = readViewportState(viewport);
  stage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  viewport.dataset.interactive = zoom > 1 ? "true" : "false";
}

function zoomViewport(viewport: HTMLElement, action: string, focal?: { x: number; y: number }) {
  const { zoom, panX, panY } = readViewportState(viewport);
  let nextZoom = zoom;
  if (action === "in") {
    nextZoom = Math.min(zoom * ZOOM_STEP, MAX_ZOOM);
  } else if (action === "out") {
    nextZoom = Math.max(zoom / ZOOM_STEP, MIN_ZOOM);
  } else if (action === "reset") {
    nextZoom = 1;
  }

  if (nextZoom <= 1) {
    viewport.dataset.panX = "0";
    viewport.dataset.panY = "0";
  } else if (focal && nextZoom !== zoom) {
    // Focal-point zoom: keep the point under `focal` visually stationary.
    // Stage uses transform-origin: center, which (for a stage that fills
    // the viewport) aligns with the viewport center.
    const rect = viewport.getBoundingClientRect();
    const offsetX = focal.x - rect.width / 2;
    const offsetY = focal.y - rect.height / 2;
    const ratio = nextZoom / zoom;
    viewport.dataset.panX = String(offsetX + ratio * (panX - offsetX));
    viewport.dataset.panY = String(offsetY + ratio * (panY - offsetY));
  }

  viewport.dataset.zoom = String(nextZoom);
  applyViewportTransform(viewport);
}
