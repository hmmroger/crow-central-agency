import { AGENT_STATUS, RELATIONSHIP_TYPE, type AgentStatus, type RelationshipType } from "@crow-central-agency/shared";

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
  systemAgent: "#688fc7",
  /** Amber — DOMAIN fragment nodes */
  fragmentDomainNode: "#db924c",
  /** Dark amber — other fragment nodes (FEEDBACK/LESSON/KNOWLEDGE) */
  fragmentNode: "#11576d",
  /** Subtle gray — default (MEMBERSHIP) edges */
  edge: "#475569",
  /** Indigo — ASSOCIATION edges (agent ↔ fragment) */
  edgeAssociation: "#6366f1",
  /** Amber — LINK edges (fragment ↔ fragment) */
  edgeLink: "#7acc00",
  /** Cyan — highlighted edges */
  edgeHighlight: "#22d3ee",
  /** Faint slate — non-highlighted edges while a node is hovered */
  edgeDimmed: "#2a3647",
  /** Light gray — agent node labels */
  label: "#cbd5e1",
  /** Light purple — circle node labels */
  circleLabel: "#c4b5fd",
  /** Dark slate — dimmed non-highlighted nodes */
  dimmed: "#334155",
} as const;

/** Node sizes by type and state */
export const GRAPH_NODE_SIZE = {
  circle: 15,
  agentIdle: 8,
  agentStreaming: 10,
  agentCompacting: 9,
  fragmentDomain: 6,
  fragment: 4,
} as const;

/** Default edge size */
export const GRAPH_EDGE_SIZE = 1.5;

/** Maps a relationship type to its resting edge color */
export const EDGE_COLOR_BY_RELATIONSHIP: Record<RelationshipType, string> = {
  [RELATIONSHIP_TYPE.MEMBERSHIP]: GRAPH_COLORS.edge,
  [RELATIONSHIP_TYPE.ASSOCIATION]: GRAPH_COLORS.edgeAssociation,
  [RELATIONSHIP_TYPE.LINK]: GRAPH_COLORS.edgeLink,
};

/** Maps agent status to node color and size */
export const STATUS_APPEARANCE: Record<AgentStatus, { color: string; size: number }> = {
  [AGENT_STATUS.IDLE]: { color: GRAPH_COLORS.agentNode, size: GRAPH_NODE_SIZE.agentIdle },
  [AGENT_STATUS.ACTIVATING]: { color: GRAPH_COLORS.agentStreaming, size: GRAPH_NODE_SIZE.agentStreaming },
  [AGENT_STATUS.STREAMING]: { color: GRAPH_COLORS.agentStreaming, size: GRAPH_NODE_SIZE.agentStreaming },
  [AGENT_STATUS.COMPACTING]: { color: GRAPH_COLORS.agentCompacting, size: GRAPH_NODE_SIZE.agentCompacting },
};
