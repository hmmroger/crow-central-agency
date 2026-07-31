import type { GraphNode, RelationshipDirection } from "@crow-central-agency/shared";

/**
 * One direct edge of the open fragment, derived from the graph cache.
 */
export interface FragmentRelationshipRow {
  relationshipId: string;
  direction: RelationshipDirection;
  node: GraphNode;
}
