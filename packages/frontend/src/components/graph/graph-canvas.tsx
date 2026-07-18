import { useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ENTITY_TYPE, type GraphData } from "@crow-central-agency/shared";
import { useGraphQuery } from "../../hooks/queries/use-graph-query.js";
import {
  useClearGraphPositions,
  useSaveGraphPositions,
  type SaveGraphPositionInput,
} from "../../hooks/queries/use-graph-mutations.js";
import { graphKeys } from "../../services/query-keys.js";
import { useGraphInstance } from "./use-graph-instance.js";
import { useGraphAgentStatus } from "./use-graph-agent-status.js";
import { GraphControls } from "./graph-controls.js";
import { GraphLegend } from "./graph-legend.js";
import { GraphTooltip } from "./graph-tooltip.js";

interface GraphCanvasProps {
  className?: string;
  showControls?: boolean;
  showLegend?: boolean;
  /** When true, fragment nodes and their edges are excluded from the graph */
  hideFragments?: boolean;
}

/** Drops fragment nodes and any edges connected to them */
function excludeFragments(graphData: GraphData): GraphData {
  const fragmentIds = new Set(
    graphData.nodes.filter((node) => node.entityType === ENTITY_TYPE.FRAGMENT).map((node) => node.id)
  );

  return {
    nodes: graphData.nodes.filter((node) => !fragmentIds.has(node.id)),
    edges: graphData.edges.filter((edge) => !fragmentIds.has(edge.source) && !fragmentIds.has(edge.target)),
  };
}

/**
 * Self-contained graph canvas that encapsulates all sigma/graphology hooks.
 * Renders the WebGL graph into a container div.
 * Used by both the full GraphView and the dashboard MiniGraph.
 */
export function GraphCanvas({ className, showControls, showLegend, hideFragments }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { data: graphData } = useGraphQuery();
  const { mutate: saveGraphPositions } = useSaveGraphPositions();
  const { mutate: clearGraphPositions } = useClearGraphPositions();
  const displayData = useMemo(
    () => (graphData && hideFragments ? excludeFragments(graphData) : graphData),
    [graphData, hideFragments]
  );

  // Dragging persists layout, so it is enabled only on the interactive full graph (controls shown).
  const handlePersistPosition = useCallback(
    (position: SaveGraphPositionInput) => saveGraphPositions([position]),
    [saveGraphPositions]
  );
  const { graphRef, sigmaRef, tooltip, resetLayout } = useGraphInstance(
    containerRef,
    displayData,
    showControls ? handlePersistPosition : undefined
  );

  useGraphAgentStatus(graphRef);

  const handleResetPositions = useCallback(() => {
    clearGraphPositions(undefined, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: graphKeys.data() });
        resetLayout();
      },
    });
  }, [clearGraphPositions, queryClient, resetLayout]);

  return (
    <div className={className}>
      <div ref={containerRef} className="h-full w-full" />
      {tooltip && <GraphTooltip tooltip={tooltip} />}
      {showControls && <GraphControls sigmaRef={sigmaRef} onResetPositions={handleResetPositions} />}
      {showLegend && <GraphLegend />}
    </div>
  );
}
