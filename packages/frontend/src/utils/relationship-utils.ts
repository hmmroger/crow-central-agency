import {
  relationshipMatchesQuery,
  type Relationship,
  type RelationshipQuery,
  type RelationshipsChangedWsMessage,
} from "@crow-central-agency/shared";

/**
 * A new filtered relationship list with one RELATIONSHIPS_CHANGED applied: deleted
 * ids are removed, and each upserted edge replaces its id when it matches the
 * filter or is removed by id when it no longer does (a re-key can move it out).
 */
export function applyRelationshipsChanged(
  relationships: readonly Relationship[],
  message: RelationshipsChangedWsMessage,
  filter: RelationshipQuery
): Relationship[] {
  const changedIds = new Set(message.deletedIds.concat(message.upserted.map((relationship) => relationship.id)));
  const matchingUpserts = message.upserted.filter((relationship) => relationshipMatchesQuery(relationship, filter));

  return relationships.filter((relationship) => !changedIds.has(relationship.id)).concat(matchingUpserts);
}

/** URL query string of a relationship filter's provided fields */
export function toRelationshipQueryString(filter: RelationshipQuery): string {
  const params = new URLSearchParams();
  for (const [field, value] of Object.entries(filter)) {
    if (value) {
      params.set(field, value);
    }
  }

  return params.toString();
}
