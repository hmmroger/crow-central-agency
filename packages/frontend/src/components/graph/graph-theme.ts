import { AGENT_STATUS, type AgentStatus } from "@crow-central-agency/shared";

/** RGB color constants for graph nodes and edges */
export const GRAPH_COLORS = {
  /** Purple — circle nodes */
  circleNode: "#a78bfa",
  /** Slate gray — idle agent nodes */
  agentNode: "#94a3b8",
  /** Cyan — streaming agent nodes */
  agentStreaming: "#22d3ee",
  /** Orange — compacting agent nodes */
  agentCompacting: "#cb623c",
  /** Green — system agent nodes */
  systemAgent: "#00d587",
  /** Subtle gray — default edges */
  edge: "#475569",
  /** Cyan — highlighted edges */
  edgeHighlight: "#22d3ee",
  /** Light gray — agent node labels */
  label: "#cbd5e1",
  /** Light purple — circle node labels */
  circleLabel: "#c4b5fd",
  /** Dark slate — dimmed non-highlighted nodes */
  dimmed: "#334155",
  /** Dark surface — hover label background */
  hoverBackground: "#1e293b",
  /** White — hover label text */
  hoverLabel: "#f1f5f9",
} as const;

/** Node sizes by type and state */
export const GRAPH_NODE_SIZE = {
  circle: 15,
  agentIdle: 8,
  agentStreaming: 10,
  agentCompacting: 9,
} as const;

/** Default edge size */
export const GRAPH_EDGE_SIZE = 1.5;

/** Maps agent status to node color and size */
export const STATUS_APPEARANCE: Record<AgentStatus, { color: string; size: number }> = {
  [AGENT_STATUS.IDLE]: { color: GRAPH_COLORS.agentNode, size: GRAPH_NODE_SIZE.agentIdle },
  [AGENT_STATUS.ACTIVATING]: { color: GRAPH_COLORS.agentStreaming, size: GRAPH_NODE_SIZE.agentStreaming },
  [AGENT_STATUS.STREAMING]: { color: GRAPH_COLORS.agentStreaming, size: GRAPH_NODE_SIZE.agentStreaming },
  [AGENT_STATUS.COMPACTING]: { color: GRAPH_COLORS.agentCompacting, size: GRAPH_NODE_SIZE.agentCompacting },
};
