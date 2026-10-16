import type { Entity, Relationship, RelationshipQuery } from "../schemas/agent-circle.schema.js";

/** Identity key of an entity across entity types */
export function toEntityKey(entity: Entity): string {
  return `${entity.entityType}:${entity.id}`;
}

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
