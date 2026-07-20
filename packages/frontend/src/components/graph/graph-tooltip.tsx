import type { GraphTooltipState } from "./graph-view.types.js";
import { KIND_LABEL } from "./fragment-kind-label.js";

interface GraphTooltipProps {
  tooltip: GraphTooltipState;
}

/**
 * HTML hover popover for a graph node, positioned within the graph container.
 * Reveals the fragment's cue label and its kind.
 */
export function GraphTooltip({ tooltip }: GraphTooltipProps) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-30 max-w-48 rounded-lg border border-border-subtle bg-surface-elevated/90 px-3 py-2 shadow-lg backdrop-blur-md"
      style={{ left: tooltip.x, top: tooltip.y }}
    >
      <div className="text-2xs font-medium text-text-base wrap-break-word">{tooltip.label}</div>
      {tooltip.kind && (
        <div className="mt-0.5 text-3xs uppercase tracking-wider text-text-muted">{KIND_LABEL[tooltip.kind]}</div>
      )}
    </div>
  );
}
