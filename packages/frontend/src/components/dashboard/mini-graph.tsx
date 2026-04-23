import { Maximize2 } from "lucide-react";
import { GraphCanvas } from "../graph/graph-canvas.js";
import { useAppStore, VIEW_MODE } from "../../stores/app-store.js";
import { DashboardWidget } from "./dashboard-widget.js";

interface MiniGraphProps {
  className?: string;
}

/**
 * Compact graph preview for the dashboard top section.
 * Wraps GraphCanvas in a fixed-height container with an expand button.
 */
export function MiniGraph({ className }: MiniGraphProps) {
  const setViewMode = useAppStore((state) => state.setViewMode);

  const expandAction = (
    <button
      type="button"
      className="flex items-center gap-1 text-3xs text-text-muted hover:text-text-base transition-colors"
      onClick={() => setViewMode(VIEW_MODE.GRAPH)}
      title="Open circles map"
    >
      <Maximize2 className="h-3 w-3" />
    </button>
  );

  return (
    <DashboardWidget title="Circles Map" action={expandAction} className={className}>
      <GraphCanvas className="relative h-52 rounded-lg border border-border-subtle overflow-hidden bg-surface-inset" />
    </DashboardWidget>
  );
}
