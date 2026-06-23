import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` that updates only after `delayMs` has elapsed without a change.
 * Generic and side-effect-free — useful for deferring expensive work (e.g. a persist request) until
 * input settles.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
