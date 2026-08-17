import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

interface UseStickToBottomOptions {
  scrollRef: RefObject<HTMLElement | null>;
  /** Ref to the inner content wrapper observed for size changes */
  contentRef: RefObject<HTMLElement | null>;
}

interface UseStickToBottomResult {
  scheduleScrollIfPinned: () => void;
  isSettled: boolean;
}

/** Distance from bottom in pixels within which the pin re-acquires after a gesture settles */
const RE_PIN_THRESHOLD_PX = 32;

/** Debounce delay in milliseconds after the last scroll event before re-evaluating the pin */
const GESTURE_SETTLE_MS = 150;

/** Quiet window in milliseconds with no ResizeObserver fires before marking settled */
const CONTENT_QUIET_MS = 100;

/** Hard upper bound in milliseconds to force settled even if something never stops resizing */
const CONTENT_SETTLE_HARD_CAP_MS = 300;

const NAVIGATION_KEYS = new Set(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"]);

export function useStickToBottom({ scrollRef, contentRef }: UseStickToBottomOptions): UseStickToBottomResult {
  const pinnedRef = useRef(true);
  const gestureActiveRef = useRef(false);
  const rafHandleRef = useRef<number | undefined>(undefined);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settledRef = useRef(false);
  const contentQuietTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const contentHardCapTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [isSettled, setIsSettled] = useState(false);

  const scheduleScrollIfPinned = useCallback(() => {
    if (!pinnedRef.current) {
      return;
    }

    if (rafHandleRef.current !== undefined) {
      return;
    }

    rafHandleRef.current = requestAnimationFrame(() => {
      rafHandleRef.current = undefined;

      if (!pinnedRef.current) {
        return;
      }

      const scrollElement = scrollRef.current;

      if (!scrollElement) {
        return;
      }

      scrollElement.scrollTop = scrollElement.scrollHeight;
    });
  }, [scrollRef]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    const contentElement = contentRef.current;

    if (!scrollElement || !contentElement) {
      return;
    }

    const clearRaf = () => {
      if (rafHandleRef.current === undefined) {
        return;
      }

      cancelAnimationFrame(rafHandleRef.current);
      rafHandleRef.current = undefined;
    };

    const clearSettleTimer = () => {
      if (settleTimerRef.current === undefined) {
        return;
      }

      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = undefined;
    };

    const clearContentQuietTimer = () => {
      if (contentQuietTimerRef.current === undefined) {
        return;
      }

      clearTimeout(contentQuietTimerRef.current);
      contentQuietTimerRef.current = undefined;
    };

    const clearContentHardCapTimer = () => {
      if (contentHardCapTimerRef.current === undefined) {
        return;
      }

      clearTimeout(contentHardCapTimerRef.current);
      contentHardCapTimerRef.current = undefined;
    };

    const markSettled = () => {
      if (settledRef.current) {
        return;
      }

      settledRef.current = true;
      clearContentQuietTimer();
      clearContentHardCapTimer();
      setIsSettled(true);
    };

    const evaluatePinAfterGesture = () => {
      settleTimerRef.current = undefined;
      gestureActiveRef.current = false;

      const distanceFromBottom = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;
      pinnedRef.current = distanceFromBottom <= RE_PIN_THRESHOLD_PX;

      if (pinnedRef.current) {
        scheduleScrollIfPinned();
      }
    };

    const armSettleTimer = () => {
      clearSettleTimer();
      settleTimerRef.current = setTimeout(evaluatePinAfterGesture, GESTURE_SETTLE_MS);
    };

    const startGesture = () => {
      pinnedRef.current = false;
      gestureActiveRef.current = true;
      clearRaf();
      armSettleTimer();
    };

    const handleScroll = () => {
      if (!gestureActiveRef.current) {
        return;
      }

      armSettleTimer();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!NAVIGATION_KEYS.has(event.key)) {
        return;
      }

      startGesture();
    };

    scrollElement.addEventListener("wheel", startGesture, { passive: true });
    scrollElement.addEventListener("touchmove", startGesture, { passive: true });
    scrollElement.addEventListener("pointerdown", startGesture, { passive: true });
    scrollElement.addEventListener("keydown", handleKeyDown, { passive: true });
    scrollElement.addEventListener("scroll", handleScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      scheduleScrollIfPinned();

      if (settledRef.current) {
        return;
      }

      clearContentQuietTimer();
      contentQuietTimerRef.current = setTimeout(markSettled, CONTENT_QUIET_MS);
    });
    resizeObserver.observe(contentElement);

    contentHardCapTimerRef.current = setTimeout(markSettled, CONTENT_SETTLE_HARD_CAP_MS);

    return () => {
      scrollElement.removeEventListener("wheel", startGesture);
      scrollElement.removeEventListener("touchmove", startGesture);
      scrollElement.removeEventListener("pointerdown", startGesture);
      scrollElement.removeEventListener("keydown", handleKeyDown);
      scrollElement.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
      clearRaf();
      clearSettleTimer();
      clearContentQuietTimer();
      clearContentHardCapTimer();
    };
  }, [scrollRef, contentRef, scheduleScrollIfPinned]);

  return { scheduleScrollIfPinned, isSettled };
}
