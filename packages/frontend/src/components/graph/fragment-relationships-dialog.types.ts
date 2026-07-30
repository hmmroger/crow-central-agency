import type { GraphNode, RelationshipDirection } from "@crow-central-agency/shared";

/**
 * One direct edge of the open fragment, derived from the graph cache.
 * `node` is the counterpart entity; it is undefined when the counterpart is a
 * background agent, which the graph omits from its node list while keeping the edge.
 */
export interface FragmentRelationshipRow {
  relationshipId: string;
  direction: RelationshipDirection;
  node: GraphNode | undefined;
}
