import type { Relationship, RelationshipQuery } from "../schemas/agent-circle.schema.js";

/** Check whether a relationship matches every field the query provides */
export function relationshipMatchesQuery(relationship: Relationship, query: RelationshipQuery): boolean {
  return (
    (!query.sourceEntityId || query.sourceEntityId === relationship.sourceEntityId) &&
    (!query.sourceEntityType || query.sourceEntityType === relationship.sourceEntityType) &&
    (!query.targetEntityId || query.targetEntityId === relationship.targetEntityId) &&
    (!query.targetEntityType || query.targetEntityType === relationship.targetEntityType) &&
    (!query.relationshipType || query.relationshipType === relationship.relationshipType)
  );
}
