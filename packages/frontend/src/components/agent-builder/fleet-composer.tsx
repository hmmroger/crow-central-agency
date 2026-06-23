import { useCallback, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Wand2 } from "lucide-react";

interface FleetComposerProps {
  /** Whether the current draft already has a designed fleet — switches placeholder and action wording. */
  hasAgents: boolean;
  /** A design/refine run is in flight — disables input and action. */
  isPending: boolean;
  /** Design/refine error message to surface near the composer. */
  error?: string;
  /** Submit the requirement (or refinement). Resolves on success, rejects on failure. */
  onSubmit: (input: string) => Promise<void>;
}

/**
 * Composer for designing or refining the fleet — a multi-line writing area, not a chat line, since
 * describing a fleet is a substantial brief. Renders as a self-contained card; the view owns its
 * placement (centered hero when empty, docked when a fleet exists). The board is the state; this only
 * sends the requirement. Ctrl/Cmd+Enter submits. The input clears only on a successful run.
 */
export function FleetComposer({ hasAgents, isPending, error, onSubmit }: FleetComposerProps) {
  const [input, setInput] = useState("");

  const handleChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isPending) {
      return;
    }

    try {
      await onSubmit(trimmed);
      setInput("");
    } catch {
      // Error is surfaced via the `error` prop.
    }
  }, [input, isPending, onSubmit]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const placeholder = hasAgents ? "Refine your fleet" : "Describe the agents you want";
  const actionLabel = hasAgents ? "Refine" : "Design fleet";

  return (
    <div className="w-full">
      {error && (
        <div className="mb-2 rounded-md border border-error/20 bg-error/10 p-2 text-xs text-error">{error}</div>
      )}

      <div className="rounded-lg border border-border-subtle bg-surface/70 px-3 py-2.5 backdrop-blur-md focus-within:border-border-focus">
        <textarea
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isPending}
          rows={5}
          className="max-h-72 w-full resize-y overflow-y-auto bg-transparent text-sm text-text-base outline-none placeholder:text-text-muted disabled:opacity-50"
        />

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
          <span className="text-2xs text-text-muted/60">Ctrl/⌘+Enter to submit</span>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-text-primary transition-opacity hover:opacity-90 disabled:opacity-30"
            onClick={handleSubmit}
            disabled={isPending || !input.trim()}
          >
            <Wand2 className="h-3 w-3" />
            {isPending ? "Working..." : actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
