import { useEffect, type RefObject } from "react";
import {
  applyViewportTransform,
  MERMAID_CONTROLS_SELECTOR,
  MERMAID_VIEWPORT_SELECTOR,
  MERMAID_ZOOM_BUTTON_SELECTOR,
  readViewportState,
  zoomViewport,
} from "./mermaid-viewport";

interface PanDragState {
  viewport: HTMLElement;
  pointerId: number;
  startPointerX: number;
  startPointerY: number;
  startPanX: number;
  startPanY: number;
}

/**
 * Zoom buttons, Ctrl/Cmd+wheel focal zoom and drag-to-pan for every mermaid
 * viewport inside the container, via delegated native listeners.
 */
export function useMermaidViewport(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let drag: PanDragState | undefined;

    const handleClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const zoomBtn = event.target.closest<HTMLElement>(MERMAID_ZOOM_BUTTON_SELECTOR);
      const action = zoomBtn?.dataset.zoomAction;
      const viewport = zoomBtn?.closest<HTMLElement>(MERMAID_VIEWPORT_SELECTOR);
      if (action && viewport) {
        zoomViewport(viewport, action);
      }
    };

    // Non-passive so Ctrl/Cmd+wheel can zoom without scrolling the page.
    const handleWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !(event.target instanceof Element)) {
        return;
      }

      const viewport = event.target.closest<HTMLElement>(MERMAID_VIEWPORT_SELECTOR);
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

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const viewport = event.target.closest<HTMLElement>(MERMAID_VIEWPORT_SELECTOR);
      if (!viewport || event.button !== 0 || event.target.closest(MERMAID_CONTROLS_SELECTOR)) {
        return;
      }

      const { zoom, panX, panY } = readViewportState(viewport);
      if (zoom <= 1) {
        return;
      }

      viewport.setPointerCapture(event.pointerId);
      viewport.dataset.panning = "true";
      drag = {
        viewport,
        pointerId: event.pointerId,
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startPanX: panX,
        startPanY: panY,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      drag.viewport.dataset.panX = String(drag.startPanX + event.clientX - drag.startPointerX);
      drag.viewport.dataset.panY = String(drag.startPanY + event.clientY - drag.startPointerY);
      applyViewportTransform(drag.viewport);
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      if (drag.viewport.hasPointerCapture(event.pointerId)) {
        drag.viewport.releasePointerCapture(event.pointerId);
      }

      delete drag.viewport.dataset.panning;
      drag = undefined;
    };

    container.addEventListener("click", handleClick);
    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerup", handlePointerEnd);
    container.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      container.removeEventListener("click", handleClick);
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", handlePointerEnd);
      container.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [containerRef]);
}
