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
}

/** Sigma edge attributes for the relationship graph */
export interface GraphEdgeAttributes {
  color: string;
  size: number;
  relationshipType: RelationshipType;
}
