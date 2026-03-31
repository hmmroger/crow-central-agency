import { useCallback, useEffect, useRef } from "react";

interface UseResizablePanelOptions {
  /** Minimum allowed width in pixels */
  minWidth: number;
  /** Maximum allowed width in pixels */
  maxWidth: number;
  /** Current panel width */
  currentWidth: number;
  /** Callback fired on resize with the new width */
  onResize: (width: number) => void;
  /** Which side the resize handle sits on - determines drag direction */
  direction: "left" | "right";
}

const KEYBOARD_STEP = 5;
const KEYBOARD_STEP_LARGE = 20;

/**
 * Pointer-capture-based panel resize hook.
 * Returns handlers for a resize handle element - supports drag and keyboard (arrow keys, shift for large steps).
 */
export function useResizablePanel({ minWidth, maxWidth, currentWidth, onResize, direction }: UseResizablePanelOptions) {
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const cleanupRef = useRef<(() => void) | undefined>(undefined);

  // Clean up listeners if component unmounts during drag
  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  const clampWidth = useCallback(
    (width: number) => Math.min(maxWidth, Math.max(minWidth, width)),
    [minWidth, maxWidth]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      isDragging.current = true;
      startX.current = event.clientX;
      startWidth.current = currentWidth;

      const target = event.currentTarget as HTMLElement;
      const pointerId = event.pointerId;
      target.setPointerCapture(pointerId);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (!isDragging.current) {
          return;
        }

        const delta = moveEvent.clientX - startX.current;
        const multiplier = direction === "left" ? 1 : -1;
        onResize(clampWidth(startWidth.current + delta * multiplier));
      };

      const cleanup = () => {
        isDragging.current = false;
        try {
          target.releasePointerCapture(pointerId);
        } catch {
          // Element may already be unmounted
        }

        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", cleanup);
        cleanupRef.current = undefined;
      };

      cleanupRef.current = cleanup;
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", cleanup);
    },
    [currentWidth, onResize, direction, clampWidth]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      event.preventDefault();

      const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
      const grow = direction === "left" ? "ArrowRight" : "ArrowLeft";
      const delta = event.key === grow ? step : -step;
      onResize(clampWidth(currentWidth + delta));
    },
    [currentWidth, onResize, direction, clampWidth]
  );

  return { handlePointerDown, handleKeyDown };
}
