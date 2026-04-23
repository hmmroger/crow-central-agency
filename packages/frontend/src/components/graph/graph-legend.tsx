import { GRAPH_COLORS } from "./graph-theme.js";

interface LegendItemProps {
  color: string;
  label: string;
}

function LegendItem({ color, label }: LegendItemProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-2xs text-text-neutral">{label}</span>
    </div>
  );
}

/**
 * Floating legend showing node type and status color mapping.
 */
export function GraphLegend() {
  return (
    <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 bg-surface-elevated/75 border border-border-subtle rounded-lg backdrop-blur-md px-3 py-2">
      <span className="text-3xs text-text-muted uppercase tracking-wider">Legend</span>
      <LegendItem color={GRAPH_COLORS.circleNode} label="Circle" />
      <LegendItem color={GRAPH_COLORS.agentNode} label="Agent (idle)" />
      <LegendItem color={GRAPH_COLORS.agentStreaming} label="Agent (streaming)" />
      <LegendItem color={GRAPH_COLORS.agentCompacting} label="Agent (compacting)" />
      <LegendItem color={GRAPH_COLORS.systemAgent} label="System agent" />
    </div>
  );
}
