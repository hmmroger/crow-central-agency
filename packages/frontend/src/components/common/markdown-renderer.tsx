import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import mermaid from "mermaid";
import { ensureMermaidInit } from "../../utils/mermaid-config";
import { parseMarkdown } from "../../utils/marked-config";
import { sanitizeSvg } from "../../utils/html-sanitizer";
import { cn } from "../../utils/cn";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;

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

  // Memoize parsed HTML with copy buttons injected
  const html = useMemo(() => injectCopyButtons(parseMarkdown(content)), [content]);
  const [renderedHtml, setRenderedHtml] = useState(html);

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

  // Event delegation: handles copy buttons and mermaid zoom buttons.
  const handleContainerClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
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
  }, []);

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
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
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
