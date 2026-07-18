import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import Sigma from "sigma";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { MouseCoords, NodeDisplayData, PartialButFor } from "sigma/types";
import { ENTITY_TYPE, FRAGMENT_KIND, type GraphData } from "@crow-central-agency/shared";
import { useAppStore } from "../../stores/app-store.js";
import type { SaveGraphPositionInput } from "../../hooks/queries/use-graph-mutations.js";
import {
  GRAPH_COLORS,
  GRAPH_NODE_SIZE,
  GRAPH_EDGE_SIZE,
  STATUS_APPEARANCE,
  EDGE_COLOR_BY_RELATIONSHIP,
} from "./graph-theme.js";
import type { GraphNodeAttributes, GraphEdgeAttributes, GraphTooltipState } from "./graph-view.types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** ForceAtlas2 settings tuned for membership DAGs */
const LAYOUT_SETTINGS = {
  gravity: 1,
  scalingRatio: 10,
  linLogMode: true,
  strongGravityMode: false,
  barnesHutOptimize: false,
};

const INITIAL_LAYOUT_ITERATIONS = 150;

// ---------------------------------------------------------------------------
// Custom hover renderer
// ---------------------------------------------------------------------------

/**
 * Minimal hover renderer: redraws just the highlighted node dot, with no
 * on-canvas label box. Node details are surfaced by the HTML tooltip instead.
 */
function drawNodeHover(
  context: CanvasRenderingContext2D,
  data: PartialButFor<NodeDisplayData, "x" | "y" | "size" | "label" | "color">
) {
  context.beginPath();
  context.fillStyle = data.color;
  context.arc(data.x, data.y, data.size, 0, Math.PI * 2);
  context.closePath();
  context.fill();
}

/** Estimated tooltip footprint used to keep it inside the container bounds */
const TOOLTIP_ESTIMATED_WIDTH = 200;
const TOOLTIP_ESTIMATED_HEIGHT = 56;
const TOOLTIP_CURSOR_OFFSET = 14;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface GraphInstanceResult {
  graphRef: RefObject<Graph<GraphNodeAttributes, GraphEdgeAttributes>>;
  sigmaRef: RefObject<Sigma<GraphNodeAttributes, GraphEdgeAttributes> | null>;
  tooltip: GraphTooltipState | undefined;
  /** Clear anchors, re-run ForceAtlas2 over the live graph, and reset the camera */
  resetLayout: () => void;
}

/** Clear the transient FA2 `fixed` anchors left over from a layout pass */
function clearAnchors(graph: Graph<GraphNodeAttributes, GraphEdgeAttributes>): void {
  graph.forEachNode((node) => graph.removeNodeAttribute(node, "fixed"));
}

/**
 * Manages the full graph lifecycle: graphology data, sigma renderer,
 * ForceAtlas2 layout, and click/hover/drag interactions.
 *
 * Sigma is created once on first data arrival and destroyed on unmount.
 * Subsequent data changes reconcile the graphology graph in-place.
 *
 * When `onPersistPosition` is provided, nodes become draggable and each
 * drag-end persists the node's new position.
 */
export function useGraphInstance(
  containerRef: RefObject<HTMLDivElement | null>,
  graphData: GraphData | undefined,
  onPersistPosition?: (position: SaveGraphPositionInput) => void
): GraphInstanceResult {
  const graphRef = useRef<Graph<GraphNodeAttributes, GraphEdgeAttributes>>(
    new Graph<GraphNodeAttributes, GraphEdgeAttributes>()
  );
  const sigmaRef = useRef<Sigma<GraphNodeAttributes, GraphEdgeAttributes> | null>(null);
  const [ready, setReady] = useState(false);
  const [tooltip, setTooltip] = useState<GraphTooltipState | undefined>(undefined);

  // Held in a ref so the sigma lifecycle effect never re-runs when the callback identity changes.
  const persistPositionRef = useRef(onPersistPosition);
  useEffect(() => {
    persistPositionRef.current = onPersistPosition;
  }, [onPersistPosition]);

  // Reconcile graph data on every change
  useEffect(() => {
    if (!graphData) {
      return;
    }

    reconcileGraph(graphRef.current, graphData);

    if (!ready) {
      setReady(true);
    }
  }, [graphData, ready]);

  // Create sigma, run layout, register events — all in one lifecycle
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !ready) {
      return;
    }

    const graph = graphRef.current;

    // --- Hover / interaction state (read by the reducers and handlers) ---
    let hoveredNode: string | null = null;
    let neighbors = new Set<string>();
    let isDragging = false;
    let draggedNode: string | null = null;
    let didDragNode = false;

    // --- Sigma ---
    const sigma = new Sigma(graph, container, {
      allowInvalidContainer: true,
      renderLabels: true,
      labelRenderedSizeThreshold: 4,
      labelColor: { attribute: "labelColor" },
      defaultEdgeColor: GRAPH_COLORS.edge,
      defaultEdgeType: "arrow",
      enableEdgeEvents: false,
      zIndex: true,
      defaultNodeColor: GRAPH_COLORS.agentNode,
      labelFont: "Inter, system-ui, sans-serif",
      labelSize: 11,
      defaultDrawNodeHover: drawNodeHover,
    });

    sigmaRef.current = sigma;

    // --- Layout ---
    // Saved-position nodes are anchored (`fixed`) by reconcileGraph; only unsaved
    // nodes need to settle. Skip the whole pass when every node is anchored.
    const hasUnsavedNodes = graph.someNode((_node, attributes) => !attributes.fixed);
    if (hasUnsavedNodes) {
      forceAtlas2.assign(graph, { iterations: INITIAL_LAYOUT_ITERATIONS, settings: LAYOUT_SETTINGS });
    }

    clearAnchors(graph);
    sigma.getCamera().animatedReset({ duration: 300 });

    // --- Events ---
    const goToAgentConsole = useAppStore.getState().goToAgentConsole;

    const handleClickNode = ({ node }: { node: string }) => {
      // Sigma emits clickNode at the tail of a drag; a reposition must not navigate.
      if (didDragNode) {
        return;
      }

      const entityType = graph.getNodeAttribute(node, "entityType");
      if (entityType === ENTITY_TYPE.AGENT) {
        goToAgentConsole(node);
      }
    };

    const handleEnterNode = ({ node, event }: { node: string; event: { x: number; y: number } }) => {
      hoveredNode = node;
      neighbors = new Set(graph.neighbors(node));
      sigma.refresh({ skipIndexation: true });

      // Suppress the tooltip while panning or dragging a node, and only for fragments (which carry no persistent label).
      if (isDragging || draggedNode || graph.getNodeAttribute(node, "entityType") !== ENTITY_TYPE.FRAGMENT) {
        setTooltip(undefined);
        return;
      }

      let tooltipX = event.x + TOOLTIP_CURSOR_OFFSET;
      let tooltipY = event.y + TOOLTIP_CURSOR_OFFSET;
      if (tooltipX + TOOLTIP_ESTIMATED_WIDTH > container.clientWidth) {
        tooltipX = event.x - TOOLTIP_ESTIMATED_WIDTH - TOOLTIP_CURSOR_OFFSET;
      }

      if (tooltipY + TOOLTIP_ESTIMATED_HEIGHT > container.clientHeight) {
        tooltipY = event.y - TOOLTIP_ESTIMATED_HEIGHT - TOOLTIP_CURSOR_OFFSET;
      }

      setTooltip({
        x: Math.max(0, tooltipX),
        y: Math.max(0, tooltipY),
        label: graph.getNodeAttribute(node, "label"),
        kind: graph.getNodeAttribute(node, "kind"),
      });
    };

    const handleLeaveNode = () => {
      hoveredNode = null;
      neighbors.clear();
      setTooltip(undefined);
      sigma.refresh({ skipIndexation: true });
    };

    const handleDoubleClickStage = () => {
      setTooltip(undefined);
      sigma.getCamera().animatedReset({ duration: 300 });
    };

    sigma.setSetting("nodeReducer", (node, data) => {
      const isFragment = graph.getNodeAttribute(node, "entityType") === ENTITY_TYPE.FRAGMENT;
      const isHovered = node === hoveredNode;

      // Fragments never render a persistent label; the tooltip reveals it on hover.
      const label = isFragment ? "" : data.label;

      if (!hoveredNode) {
        return { ...data, label };
      }

      if (isHovered || neighbors.has(node)) {
        return { ...data, label, zIndex: 1 };
      }

      return { ...data, color: GRAPH_COLORS.dimmed, label: "" };
    });

    sigma.setSetting("edgeReducer", (edge, data) => {
      if (!hoveredNode) {
        return data;
      }

      const source = graph.source(edge);
      const target = graph.target(edge);
      if (source === hoveredNode || target === hoveredNode) {
        return { ...data, color: GRAPH_COLORS.edgeHighlight, zIndex: 1 };
      }

      return { ...data, color: GRAPH_COLORS.edgeDimmed };
    });

    // Camera drag (pan) tracking — hide the tooltip while the graph is being dragged.
    const mouseCaptor = sigma.getMouseCaptor();

    // Begin a node drag: anchor the node, suppress the tooltip, and reset the moved flag.
    const handleDownNode = ({ node }: { node: string }) => {
      draggedNode = node;
      didDragNode = false;
      setTooltip(undefined);
    };

    const handleDragMove = (event: MouseCoords) => {
      // While dragging a node, move it and keep the camera from panning the stage.
      if (draggedNode) {
        didDragNode = true;
        const position = sigma.viewportToGraph(event);
        graph.setNodeAttribute(draggedNode, "x", position.x);
        graph.setNodeAttribute(draggedNode, "y", position.y);
        setTooltip(undefined);
        event.preventSigmaDefault();
        return;
      }

      if (mouseCaptor.isMouseDown && !isDragging) {
        isDragging = true;
        setTooltip(undefined);
      }
    };

    const handleDragEnd = () => {
      if (draggedNode) {
        if (didDragNode) {
          persistPositionRef.current?.({
            id: draggedNode,
            x: graph.getNodeAttribute(draggedNode, "x"),
            y: graph.getNodeAttribute(draggedNode, "y"),
          });
        }

        draggedNode = null;
      }

      isDragging = false;
    };

    sigma.on("clickNode", handleClickNode);
    sigma.on("enterNode", handleEnterNode);
    sigma.on("leaveNode", handleLeaveNode);
    sigma.on("doubleClickStage", handleDoubleClickStage);
    sigma.on("downNode", handleDownNode);
    mouseCaptor.on("mousemovebody", handleDragMove);
    mouseCaptor.on("mouseup", handleDragEnd);

    // --- Resize ---
    let resizeRafHandle: number | undefined;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeRafHandle !== undefined) {
        cancelAnimationFrame(resizeRafHandle);
      }

      resizeRafHandle = requestAnimationFrame(() => {
        sigma.refresh();
        resizeRafHandle = undefined;
      });
    });
    resizeObserver.observe(container);

    // --- Cleanup (unmount only) ---
    return () => {
      if (resizeRafHandle !== undefined) {
        cancelAnimationFrame(resizeRafHandle);
      }

      resizeObserver.disconnect();
      sigma.off("clickNode", handleClickNode);
      sigma.off("enterNode", handleEnterNode);
      sigma.off("leaveNode", handleLeaveNode);
      sigma.off("doubleClickStage", handleDoubleClickStage);
      sigma.off("downNode", handleDownNode);
      mouseCaptor.off("mousemovebody", handleDragMove);
      mouseCaptor.off("mouseup", handleDragEnd);
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [containerRef, ready]);

  const resetLayout = useCallback(() => {
    const sigma = sigmaRef.current;
    if (!sigma) {
      return;
    }

    const graph = graphRef.current;
    clearAnchors(graph);
    forceAtlas2.assign(graph, { iterations: INITIAL_LAYOUT_ITERATIONS, settings: LAYOUT_SETTINGS });
    sigma.getCamera().animatedReset({ duration: 300 });
    sigma.refresh();
  }, []);

  return { graphRef, sigmaRef, tooltip, resetLayout };
}

// ---------------------------------------------------------------------------
// Graph reconciliation
// ---------------------------------------------------------------------------

/** Reconcile graphology graph with fresh GraphData from the API */
function reconcileGraph(graph: Graph<GraphNodeAttributes, GraphEdgeAttributes>, graphData: GraphData): void {
  const expectedNodeIds = new Set(graphData.nodes.map((node) => node.id));
  const expectedEdgeIds = new Set(graphData.edges.map((edge) => edge.id));

  // Remove stale nodes
  for (const nodeId of graph.nodes()) {
    if (!expectedNodeIds.has(nodeId)) {
      graph.dropNode(nodeId);
    }
  }

  // Remove stale edges
  for (const edgeId of graph.edges()) {
    if (!expectedEdgeIds.has(edgeId)) {
      graph.dropEdge(edgeId);
    }
  }

  // Add or update nodes
  const newNodeIds: string[] = [];
  for (const node of graphData.nodes) {
    const isCircle = node.entityType === ENTITY_TYPE.AGENT_CIRCLE;
    const isFragment = node.entityType === ENTITY_TYPE.FRAGMENT;
    const isDomainFragment = isFragment && node.kind === FRAGMENT_KIND.DOMAIN;
    const isSystem = node.isSystemAgent === true;
    const statusAppearance =
      !isCircle && !isFragment && !isSystem && node.status ? STATUS_APPEARANCE[node.status] : undefined;

    const color = isCircle
      ? GRAPH_COLORS.circleNode
      : isFragment
        ? isDomainFragment
          ? GRAPH_COLORS.fragmentDomainNode
          : GRAPH_COLORS.fragmentNode
        : isSystem
          ? GRAPH_COLORS.systemAgent
          : (statusAppearance?.color ?? GRAPH_COLORS.agentNode);
    const labelColor = isCircle ? GRAPH_COLORS.circleLabel : GRAPH_COLORS.label;
    const size = isCircle
      ? GRAPH_NODE_SIZE.circle
      : isFragment
        ? isDomainFragment
          ? GRAPH_NODE_SIZE.fragmentDomain
          : GRAPH_NODE_SIZE.fragment
        : (statusAppearance?.size ?? GRAPH_NODE_SIZE.agentIdle);

    if (graph.hasNode(node.id)) {
      graph.setNodeAttribute(node.id, "label", node.name);
      graph.setNodeAttribute(node.id, "color", color);
      graph.setNodeAttribute(node.id, "labelColor", labelColor);
      graph.setNodeAttribute(node.id, "size", size);
      graph.setNodeAttribute(node.id, "entityType", node.entityType);
      graph.setNodeAttribute(node.id, "isSystemAgent", node.isSystemAgent);
      graph.setNodeAttribute(node.id, "isSystemCircle", node.isSystemCircle);
      graph.setNodeAttribute(node.id, "agentStatus", node.status);
      graph.setNodeAttribute(node.id, "kind", node.kind);
    } else {
      // Nodes with a saved position anchor the layout (`fixed`); the rest are
      // circular-seeded below and settled by ForceAtlas2.
      const hasSavedPosition = node.x !== undefined && node.y !== undefined;
      graph.addNode(node.id, {
        label: node.name,
        x: node.x ?? 0,
        y: node.y ?? 0,
        size,
        color,
        agentStatus: node.status,
        labelColor,
        entityType: node.entityType,
        isSystemAgent: node.isSystemAgent,
        isSystemCircle: node.isSystemCircle,
        kind: node.kind,
        fixed: hasSavedPosition ? true : undefined,
      });

      if (!hasSavedPosition) {
        newNodeIds.push(node.id);
      }
    }
  }

  // Add or update edges
  for (const edge of graphData.edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) {
      continue;
    }

    const edgeColor = EDGE_COLOR_BY_RELATIONSHIP[edge.relationshipType];

    if (!graph.hasEdge(edge.id)) {
      graph.addEdgeWithKey(edge.id, edge.source, edge.target, {
        color: edgeColor,
        size: GRAPH_EDGE_SIZE,
        relationshipType: edge.relationshipType,
      });
    } else {
      graph.setEdgeAttribute(edge.id, "relationshipType", edge.relationshipType);
      graph.setEdgeAttribute(edge.id, "color", edgeColor);
    }
  }

  // Seed positions only for newly added nodes
  if (newNodeIds.length > 0) {
    const angleStep = (2 * Math.PI) / newNodeIds.length;
    for (let index = 0; index < newNodeIds.length; index++) {
      graph.setNodeAttribute(newNodeIds[index], "x", Math.cos(index * angleStep));
      graph.setNodeAttribute(newNodeIds[index], "y", Math.sin(index * angleStep));
    }
  }
}
