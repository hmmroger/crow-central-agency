import { isString } from "es-toolkit";
import { useEffect, useRef, useState, type RefObject } from "react";
import Sigma from "sigma";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { NodeDisplayData, PartialButFor } from "sigma/types";
import { ENTITY_TYPE, type GraphData } from "@crow-central-agency/shared";
import { useAppStore } from "../../stores/app-store.js";
import { GRAPH_COLORS, GRAPH_NODE_SIZE, GRAPH_EDGE_SIZE, STATUS_APPEARANCE } from "./graph-theme.js";
import type { GraphNodeAttributes, GraphEdgeAttributes } from "./graph-view.types.js";

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

/** Dark-background hover tooltip matching the neon-noir theme */
function drawNodeHover(
  context: CanvasRenderingContext2D,
  data: PartialButFor<NodeDisplayData, "x" | "y" | "size" | "label" | "color">,
  settings: { labelSize: number; labelFont: string; labelWeight: string }
) {
  const { labelSize, labelFont, labelWeight } = settings;
  context.font = `${labelWeight} ${labelSize}px ${labelFont}`;

  context.fillStyle = GRAPH_COLORS.hoverBackground;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.shadowBlur = 8;
  context.shadowColor = "#000";

  const PADDING = 2;

  if (isString(data.label)) {
    const textWidth = context.measureText(data.label).width;
    const boxWidth = Math.round(textWidth + 5);
    const boxHeight = Math.round(labelSize + 2 * PADDING);
    const radius = Math.max(data.size, labelSize / 2) + PADDING;
    const angleRadian = Math.asin(boxHeight / 2 / radius);
    const xDeltaCoord = Math.sqrt(Math.abs(radius ** 2 - (boxHeight / 2) ** 2));

    context.beginPath();
    context.moveTo(data.x + xDeltaCoord, data.y + boxHeight / 2);
    context.lineTo(data.x + radius + boxWidth, data.y + boxHeight / 2);
    context.lineTo(data.x + radius + boxWidth, data.y - boxHeight / 2);
    context.lineTo(data.x + xDeltaCoord, data.y - boxHeight / 2);
    context.arc(data.x, data.y, radius, angleRadian, -angleRadian);
    context.closePath();
    context.fill();

    context.fillStyle = GRAPH_COLORS.hoverLabel;
    context.fillText(data.label, data.x + radius + 3, data.y + labelSize / 3);
  }

  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.shadowBlur = 0;

  context.beginPath();
  context.fillStyle = data.color;
  context.arc(data.x, data.y, data.size, 0, Math.PI * 2);
  context.closePath();
  context.fill();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface GraphInstanceResult {
  graphRef: RefObject<Graph<GraphNodeAttributes, GraphEdgeAttributes>>;
  sigmaRef: RefObject<Sigma<GraphNodeAttributes, GraphEdgeAttributes> | null>;
}

/**
 * Manages the full graph lifecycle: graphology data, sigma renderer,
 * ForceAtlas2 layout, and click/hover interactions.
 *
 * Sigma is created once on first data arrival and destroyed on unmount.
 * Subsequent data changes reconcile the graphology graph in-place.
 */
export function useGraphInstance(
  containerRef: RefObject<HTMLDivElement | null>,
  graphData: GraphData | undefined
): GraphInstanceResult {
  const graphRef = useRef<Graph<GraphNodeAttributes, GraphEdgeAttributes>>(
    new Graph<GraphNodeAttributes, GraphEdgeAttributes>()
  );
  const sigmaRef = useRef<Sigma<GraphNodeAttributes, GraphEdgeAttributes> | null>(null);
  const [ready, setReady] = useState(false);

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
    forceAtlas2.assign(graph, { iterations: INITIAL_LAYOUT_ITERATIONS, settings: LAYOUT_SETTINGS });
    sigma.getCamera().animatedReset({ duration: 300 });

    // --- Events ---
    const goToAgentConsole = useAppStore.getState().goToAgentConsole;
    let hoveredNode: string | null = null;
    let neighbors = new Set<string>();

    const handleClickNode = ({ node }: { node: string }) => {
      const entityType = graph.getNodeAttribute(node, "entityType");
      if (entityType === ENTITY_TYPE.AGENT) {
        goToAgentConsole(node);
      }
    };

    const handleEnterNode = ({ node }: { node: string }) => {
      hoveredNode = node;
      neighbors = new Set(graph.neighbors(node));
      sigma.refresh({ skipIndexation: true });
    };

    const handleLeaveNode = () => {
      hoveredNode = null;
      neighbors.clear();
      sigma.refresh({ skipIndexation: true });
    };

    const handleDoubleClickStage = () => {
      sigma.getCamera().animatedReset({ duration: 300 });
    };

    sigma.setSetting("nodeReducer", (node, data) => {
      if (!hoveredNode) {
        return data;
      }

      if (node === hoveredNode || neighbors.has(node)) {
        return { ...data, zIndex: 1 };
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
        return { ...data, color: GRAPH_COLORS.edgeHighlight };
      }

      return { ...data, hidden: true };
    });

    sigma.on("clickNode", handleClickNode);
    sigma.on("enterNode", handleEnterNode);
    sigma.on("leaveNode", handleLeaveNode);
    sigma.on("doubleClickStage", handleDoubleClickStage);

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
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [containerRef, ready]);

  return { graphRef, sigmaRef };
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
    const isSystem = node.isSystemAgent === true;
    const statusAppearance = !isCircle && !isSystem && node.status ? STATUS_APPEARANCE[node.status] : undefined;

    const color = isCircle
      ? GRAPH_COLORS.circleNode
      : isSystem
        ? GRAPH_COLORS.systemAgent
        : (statusAppearance?.color ?? GRAPH_COLORS.agentNode);
    const labelColor = isCircle ? GRAPH_COLORS.circleLabel : GRAPH_COLORS.label;
    const size = isCircle ? GRAPH_NODE_SIZE.circle : (statusAppearance?.size ?? GRAPH_NODE_SIZE.agentIdle);

    if (graph.hasNode(node.id)) {
      graph.setNodeAttribute(node.id, "label", node.name);
      graph.setNodeAttribute(node.id, "color", color);
      graph.setNodeAttribute(node.id, "labelColor", labelColor);
      graph.setNodeAttribute(node.id, "size", size);
      graph.setNodeAttribute(node.id, "entityType", node.entityType);
      graph.setNodeAttribute(node.id, "isSystemAgent", node.isSystemAgent);
      graph.setNodeAttribute(node.id, "isSystemCircle", node.isSystemCircle);
      graph.setNodeAttribute(node.id, "agentStatus", node.status);
    } else {
      graph.addNode(node.id, {
        label: node.name,
        x: 0,
        y: 0,
        size,
        color,
        agentStatus: node.status,
        labelColor,
        entityType: node.entityType,
        isSystemAgent: node.isSystemAgent,
        isSystemCircle: node.isSystemCircle,
      });
      newNodeIds.push(node.id);
    }
  }

  // Add or update edges
  for (const edge of graphData.edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) {
      continue;
    }

    if (!graph.hasEdge(edge.id)) {
      graph.addEdgeWithKey(edge.id, edge.source, edge.target, {
        color: GRAPH_COLORS.edge,
        size: GRAPH_EDGE_SIZE,
        relationshipType: edge.relationshipType,
      });
    } else {
      graph.setEdgeAttribute(edge.id, "relationshipType", edge.relationshipType);
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
