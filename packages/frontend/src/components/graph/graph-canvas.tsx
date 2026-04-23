import { useRef } from "react";
import { useGraphQuery } from "../../hooks/queries/use-graph-query.js";
import { useGraphInstance } from "./use-graph-instance.js";
import { useGraphAgentStatus } from "./use-graph-agent-status.js";
import { GraphControls } from "./graph-controls.js";
import { GraphLegend } from "./graph-legend.js";

interface GraphCanvasProps {
  className?: string;
  showControls?: boolean;
  showLegend?: boolean;
}

/**
 * Self-contained graph canvas that encapsulates all sigma/graphology hooks.
 * Renders the WebGL graph into a container div.
 * Used by both the full GraphView and the dashboard MiniGraph.
 */
export function GraphCanvas({ className, showControls, showLegend }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: graphData } = useGraphQuery();
  const { graphRef, sigmaRef } = useGraphInstance(containerRef, graphData);

  useGraphAgentStatus(graphRef);

  return (
    <div className={className}>
      <div ref={containerRef} className="h-full w-full" />
      {showControls && <GraphControls sigmaRef={sigmaRef} />}
      {showLegend && <GraphLegend />}
    </div>
  );
}
