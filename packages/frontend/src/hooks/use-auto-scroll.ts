import { useEffect, useRef } from "react";

/**
 * Auto-scroll a container to the bottom when dependencies change.
 * Returns a ref to attach to the scrollable container.
 */
export function useAutoScroll(trigger: unknown) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [trigger]);

  return containerRef;
}
