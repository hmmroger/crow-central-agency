import type { AgentStatus, EntityType, FragmentKind, RelationshipType } from "@crow-central-agency/shared";

/** Sigma node attributes for the relationship graph */
export interface GraphNodeAttributes {
  label: string;
  x: number;
  y: number;
  size: number;
  color: string;
  labelColor: string;
  entityType: EntityType;
  agentStatus?: AgentStatus;
  isSystemAgent?: boolean;
  isSystemCircle?: boolean;
  kind?: FragmentKind;
  /** Transient ForceAtlas2 anchor flag; frontend-only, cleared after each layout pass */
  fixed?: boolean;
}

/** Sigma edge attributes for the relationship graph */
export interface GraphEdgeAttributes {
  color: string;
  size: number;
  relationshipType: RelationshipType;
}

/** State for the HTML hover tooltip, positioned within the graph container */
export interface GraphTooltipState {
  x: number;
  y: number;
  label: string;
  kind?: FragmentKind;
}
