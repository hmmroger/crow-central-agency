import {
  GraphNodePositionSchema,
  RelationshipSchema,
  type CreateRelationshipInput,
  type GraphNodePosition,
  type Relationship,
  type RelationshipType,
} from "@crow-central-agency/shared";
import { minBy } from "es-toolkit";
import type { QueryRelationshipOptions } from "./relationship-manager.types.js";
import type { ObjectStoreProvider } from "../core/store/object-store.types.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { generateId } from "../utils/id-utils.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "relationship-manager" });

/** Object store table name for entity relationships */
export const RELATIONSHIP_STORE_TABLE = "relationships";

/** Object store table name for user-authored node layout positions */
export const GRAPH_NODE_POSITION_STORE_TABLE = "graph-node-positions";

const EMPTY_ID_SET: ReadonlySet<string> = new Set();

/** Check whether a relationship matches the given query options */
export function relationshipMatchesQuery(relationship: Relationship, options: QueryRelationshipOptions): boolean {
  return (
    (!options.sourceEntityId || options.sourceEntityId === relationship.sourceEntityId) &&
    (!options.sourceEntityType || options.sourceEntityType === relationship.sourceEntityType) &&
    (!options.targetEntityId || options.targetEntityId === relationship.targetEntityId) &&
    (!options.targetEntityType || options.targetEntityType === relationship.targetEntityType) &&
    (!options.relationshipType || options.relationshipType === relationship.relationshipType)
  );
}

/**
 * Generic graph-structure engine over the object store: owns both edges and
 * node layout. Edges cover topology (persistence, queries, reachability checks);
 * positions cover the user-authored layout keyed by entity id. Entity semantics
 * (circle membership rules, virtual relationships) live with the callers.
 */
export class RelationshipManager {
  private relationships = new Map<string, Relationship>();
  private positions = new Map<string, GraphNodePosition>();
  private idsBySourceId = new Map<string, Set<string>>();
  private idsByTargetId = new Map<string, Set<string>>();
  private idsByType = new Map<RelationshipType, Set<string>>();

  constructor(private readonly store: ObjectStoreProvider) {}

  /** Load relationships and node positions from the object store */
  public async initialize(): Promise<void> {
    const relEntries = await this.store.getAll<Relationship>(RELATIONSHIP_STORE_TABLE);
    for (const entry of relEntries) {
      const result = RelationshipSchema.safeParse(entry.value);
      if (result.success) {
        this.putRelationship(result.data);
      } else {
        log.warn({ issues: result.error.issues }, "Skipping invalid relationship in object store");
      }
    }

    const positionEntries = await this.store.getAll<GraphNodePosition>(GRAPH_NODE_POSITION_STORE_TABLE);
    for (const entry of positionEntries) {
      const result = GraphNodePositionSchema.safeParse(entry.value);
      if (result.success) {
        this.positions.set(result.data.id, result.data);
      } else {
        log.warn({ issues: result.error.issues }, "Skipping invalid node position in object store");
      }
    }

    log.info(
      { relationships: this.relationships.size, positions: this.positions.size },
      "RelationshipManager initialized"
    );
  }

  /** Get all persisted relationships */
  public getAllRelationships(): Relationship[] {
    return Array.from(this.relationships.values());
  }

  /** Get all saved node layout positions, keyed by entity id */
  public getAllPositions(): ReadonlyMap<string, GraphNodePosition> {
    return this.positions;
  }

  /** Persist node layout positions (write-through, single atomic store persist) */
  public async savePositions(positions: ReadonlyArray<GraphNodePosition>): Promise<void> {
    if (positions.length === 0) {
      return;
    }

    for (const position of positions) {
      this.positions.set(position.id, position);
    }

    await this.store.setMany(
      GRAPH_NODE_POSITION_STORE_TABLE,
      positions.map((position) => [position.id, position] as const)
    );

    log.info({ count: positions.length }, "Saved node positions");
  }

  /** Clear every saved node layout position (backs the reset-all control) */
  public async clearAllPositions(): Promise<void> {
    this.positions.clear();
    await this.store.clear(GRAPH_NODE_POSITION_STORE_TABLE);

    log.info("Cleared all node positions");
  }

  public queryRelationships(options: QueryRelationshipOptions): Relationship[] {
    const candidateIds = this.selectCandidateIds(options);
    if (!candidateIds) {
      return this.getAllRelationships().filter((relationship) => relationshipMatchesQuery(relationship, options));
    }

    const matches: Relationship[] = [];
    for (const relationshipId of candidateIds) {
      const relationship = this.relationships.get(relationshipId);
      if (relationship && relationshipMatchesQuery(relationship, options)) {
        matches.push(relationship);
      }
    }

    return matches;
  }

  /**
   * Get a single relationship by ID.
   * @throws AppError with RELATIONSHIP_NOT_FOUND if not found.
   */
  public getRelationship(relationshipId: string): Relationship {
    const relationship = this.relationships.get(relationshipId);
    if (!relationship) {
      throw new AppError(`Relationship not found: ${relationshipId}`, APP_ERROR_CODES.RELATIONSHIP_NOT_FOUND);
    }

    return relationship;
  }

  /** Create a relationship between entities */
  public async createRelationship(input: CreateRelationshipInput): Promise<Relationship> {
    const [relationship] = await this.createRelationships([input]);

    return relationship;
  }

  /**
   * Create relationships in one store persist. Every input is validated before
   * any is written, so a rejected input leaves nothing created.
   * @throws AppError with DUPLICATE_RELATIONSHIP for a self-reference, an existing
   *         relationship, or a duplicate within the batch.
   */
  public async createRelationships(inputs: ReadonlyArray<CreateRelationshipInput>): Promise<Relationship[]> {
    const createdTimestamp = Date.now();
    const relationships: Relationship[] = [];
    const pendingKeys = new Set<string>();
    for (const input of inputs) {
      this.assertCanCreate(input, pendingKeys);
      pendingKeys.add(this.relationshipKey(input));
      relationships.push({
        id: generateId(),
        sourceEntityId: input.sourceEntityId,
        sourceEntityType: input.sourceEntityType,
        targetEntityId: input.targetEntityId,
        targetEntityType: input.targetEntityType,
        relationshipType: input.relationshipType,
        createdTimestamp,
      });
    }

    if (relationships.length === 0) {
      return relationships;
    }

    for (const relationship of relationships) {
      this.putRelationship(relationship);
    }

    await this.store.setMany(
      RELATIONSHIP_STORE_TABLE,
      relationships.map((relationship) => [relationship.id, relationship] as const)
    );

    log.info(
      {
        relationships: relationships.map((relationship) => ({
          relationshipId: relationship.id,
          source: `${relationship.sourceEntityType}:${relationship.sourceEntityId}`,
          target: `${relationship.targetEntityType}:${relationship.targetEntityId}`,
        })),
      },
      "Relationships created"
    );

    return relationships;
  }

  /**
   * Delete a relationship by ID.
   * @throws AppError with RELATIONSHIP_NOT_FOUND if not found.
   */
  public async deleteRelationship(relationshipId: string): Promise<void> {
    await this.deleteRelationships([relationshipId]);
  }

  /**
   * Delete relationships by ID in one store persist. Every ID is checked before
   * any is deleted, so an unknown ID leaves nothing deleted.
   * @throws AppError with RELATIONSHIP_NOT_FOUND if any ID is not found.
   */
  public async deleteRelationships(relationshipIds: ReadonlyArray<string>): Promise<void> {
    const relationships = Array.from(new Set(relationshipIds), (relationshipId) =>
      this.getRelationship(relationshipId)
    );
    if (relationships.length === 0) {
      return;
    }

    for (const relationship of relationships) {
      this.dropRelationship(relationship);
    }

    const deletedIds = relationships.map((relationship) => relationship.id);
    await this.store.deleteMany(RELATIONSHIP_STORE_TABLE, deletedIds);

    log.info({ relationshipIds: deletedIds }, "Relationships deleted");
  }

  /**
   * Replace entity ids across every edge touching an old id and move saved node
   * positions to the new id. Relationship ids are kept. Mappings apply
   * simultaneously, so chained or swapped ids are handled. A new id must not
   * already belong to another entity with edges; that collision is not checked.
   */
  public async rekeyEntities(idMap: ReadonlyMap<string, string>): Promise<void> {
    const affectedIds = new Set<string>();
    for (const oldId of idMap.keys()) {
      this.collectEntityRelationshipIds(oldId, affectedIds);
    }

    const rekeyed = Array.from(affectedIds, (relationshipId) => {
      const relationship = this.getRelationship(relationshipId);

      return {
        previous: relationship,
        next: {
          ...relationship,
          sourceEntityId: idMap.get(relationship.sourceEntityId) ?? relationship.sourceEntityId,
          targetEntityId: idMap.get(relationship.targetEntityId) ?? relationship.targetEntityId,
        },
      };
    });

    for (const { previous, next } of rekeyed) {
      this.dropRelationship(previous);
      this.putRelationship(next);
    }

    if (rekeyed.length > 0) {
      await this.store.setMany(
        RELATIONSHIP_STORE_TABLE,
        rekeyed.map(({ next }) => [next.id, next] as const)
      );
    }

    await this.rekeyPositions(idMap);

    log.info({ entities: idMap.size, relationships: rekeyed.length }, "Rekeyed entities");
  }

  /**
   * Remove all relationships involving an entity and its saved layout position,
   * returning the removed relationship IDs. Every entity-delete site funnels
   * through here, so both edges and position are cleaned up for all entity types.
   */
  public async removeRelationshipsForEntity(entityId: string): Promise<string[]> {
    const toRemove = Array.from(this.collectEntityRelationshipIds(entityId, new Set()));
    await this.deleteRelationships(toRemove);

    if (this.positions.delete(entityId)) {
      await this.store.delete(GRAPH_NODE_POSITION_STORE_TABLE, entityId);
    }

    if (toRemove.length > 0) {
      log.info({ entityId, count: toRemove.length }, "Removed relationships for entity");
    }

    return toRemove;
  }

  /**
   * Check whether toEntityId is reachable from fromEntityId by walking persisted
   * edges that match edgeQuery in source → target direction. Used by callers to
   * reject an edge that would close a cycle.
   */
  public canReach(fromEntityId: string, toEntityId: string, edgeQuery: QueryRelationshipOptions): boolean {
    const visited = new Set<string>();

    const walk = (currentId: string): boolean => {
      if (currentId === toEntityId) {
        return true;
      }

      if (visited.has(currentId)) {
        return false;
      }

      visited.add(currentId);

      for (const relationship of this.queryRelationships({ ...edgeQuery, sourceEntityId: currentId })) {
        if (walk(relationship.targetEntityId)) {
          return true;
        }
      }

      return false;
    };

    return walk(fromEntityId);
  }

  /** Smallest index set selected by the query's id and type filters; undefined when none apply */
  private selectCandidateIds(options: QueryRelationshipOptions): ReadonlySet<string> | undefined {
    const candidateSets: ReadonlySet<string>[] = [];
    if (options.sourceEntityId) {
      candidateSets.push(this.idsBySourceId.get(options.sourceEntityId) ?? EMPTY_ID_SET);
    }

    if (options.targetEntityId) {
      candidateSets.push(this.idsByTargetId.get(options.targetEntityId) ?? EMPTY_ID_SET);
    }

    if (options.relationshipType) {
      candidateSets.push(this.idsByType.get(options.relationshipType) ?? EMPTY_ID_SET);
    }

    return minBy(candidateSets, (candidateSet) => candidateSet.size);
  }

  /**
   * @throws AppError with DUPLICATE_RELATIONSHIP for a self-reference, an existing
   *         relationship, or a match among the pending batch keys.
   */
  private assertCanCreate(input: CreateRelationshipInput, pendingKeys: ReadonlySet<string>): void {
    if (input.sourceEntityId === input.targetEntityId) {
      throw new AppError(
        "Cannot create a relationship from an entity to itself",
        APP_ERROR_CODES.DUPLICATE_RELATIONSHIP
      );
    }

    if (pendingKeys.has(this.relationshipKey(input)) || this.queryRelationships(input).length > 0) {
      throw new AppError("Duplicate relationship already exists", APP_ERROR_CODES.DUPLICATE_RELATIONSHIP);
    }
  }

  private relationshipKey(input: CreateRelationshipInput): string {
    return JSON.stringify([
      input.sourceEntityType,
      input.sourceEntityId,
      input.targetEntityType,
      input.targetEntityId,
      input.relationshipType,
    ]);
  }

  /** Add the ids of every relationship with the entity as source or target to the given set */
  private collectEntityRelationshipIds(entityId: string, relationshipIds: Set<string>): Set<string> {
    for (const relationshipId of this.idsBySourceId.get(entityId) ?? EMPTY_ID_SET) {
      relationshipIds.add(relationshipId);
    }

    for (const relationshipId of this.idsByTargetId.get(entityId) ?? EMPTY_ID_SET) {
      relationshipIds.add(relationshipId);
    }

    return relationshipIds;
  }

  /** Move saved node positions from old to new entity ids */
  private async rekeyPositions(idMap: ReadonlyMap<string, string>): Promise<void> {
    const movedPositions: GraphNodePosition[] = [];
    for (const [oldId, newId] of idMap) {
      const position = this.positions.get(oldId);
      if (position) {
        movedPositions.push({ ...position, id: newId });
      }
    }

    const newIds = new Set(idMap.values());
    const vacatedIds = Array.from(idMap.keys()).filter((oldId) => this.positions.has(oldId) && !newIds.has(oldId));

    for (const vacatedId of vacatedIds) {
      this.positions.delete(vacatedId);
    }

    await this.savePositions(movedPositions);

    if (vacatedIds.length > 0) {
      await this.store.deleteMany(GRAPH_NODE_POSITION_STORE_TABLE, vacatedIds);
    }
  }

  private putRelationship(relationship: Relationship): void {
    this.relationships.set(relationship.id, relationship);
    this.addIndexEntry(this.idsBySourceId, relationship.sourceEntityId, relationship.id);
    this.addIndexEntry(this.idsByTargetId, relationship.targetEntityId, relationship.id);
    this.addIndexEntry(this.idsByType, relationship.relationshipType, relationship.id);
  }

  private dropRelationship(relationship: Relationship): void {
    this.relationships.delete(relationship.id);
    this.removeIndexEntry(this.idsBySourceId, relationship.sourceEntityId, relationship.id);
    this.removeIndexEntry(this.idsByTargetId, relationship.targetEntityId, relationship.id);
    this.removeIndexEntry(this.idsByType, relationship.relationshipType, relationship.id);
  }

  private addIndexEntry<K>(index: Map<K, Set<string>>, key: K, relationshipId: string): void {
    const relationshipIds = index.get(key);
    if (relationshipIds) {
      relationshipIds.add(relationshipId);
    } else {
      index.set(key, new Set([relationshipId]));
    }
  }

  private removeIndexEntry<K>(index: Map<K, Set<string>>, key: K, relationshipId: string): void {
    const relationshipIds = index.get(key);
    if (relationshipIds?.delete(relationshipId) && relationshipIds.size === 0) {
      index.delete(key);
    }
  }
}
