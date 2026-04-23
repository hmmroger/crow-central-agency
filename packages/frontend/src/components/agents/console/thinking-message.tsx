import { useState } from "react";
import { ChevronRight, Zap } from "lucide-react";
import { cn } from "../../../utils/cn.js";

interface ThinkingMessageProps {
  content: string;
}

/**
 * Collapsible thinking message — collapsed by default showing a compact "Thinking" label.
 * Expands on click to reveal the thinking content in a subtle inset block.
 */
export function ThinkingMessage({ content }: ThinkingMessageProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1.5 px-3 py-1 text-xs text-text-muted hover:text-text-neutral transition-colors"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse thinking" : "Expand thinking"}
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform duration-150", expanded && "rotate-90")} />
        <Zap className="h-3 w-3 text-secondary-muted" />
        <span>Thinking</span>
      </button>

      {expanded && (
        <div className="ml-3 mt-1 pl-3 border-l-2 border-secondary-muted/40">
          <pre className="text-xs text-text-muted whitespace-pre-wrap font-mono wrap-break-word leading-relaxed">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
