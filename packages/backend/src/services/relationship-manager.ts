import {
  GraphNodePositionSchema,
  RelationshipSchema,
  type CreateRelationshipInput,
  type GraphNodePosition,
  type Relationship,
} from "@crow-central-agency/shared";
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

  constructor(private readonly store: ObjectStoreProvider) {}

  /** Load relationships and node positions from the object store */
  public async initialize(): Promise<void> {
    const relEntries = await this.store.getAll<Relationship>(RELATIONSHIP_STORE_TABLE);
    for (const entry of relEntries) {
      const result = RelationshipSchema.safeParse(entry.value);
      if (result.success) {
        this.relationships.set(result.data.id, result.data);
      } else {
        log.warn({ issues: result.error.issues }, "Skipping invalid relationship in object store");
      }
    }

    const positionEntries = await this.store.query<GraphNodePosition>(GRAPH_NODE_POSITION_STORE_TABLE, []);
    for (const [entityId, entry] of positionEntries) {
      const result = GraphNodePositionSchema.safeParse(entry.value);
      if (result.success) {
        this.positions.set(entityId, result.data);
      } else {
        log.warn({ entityId, issues: result.error.issues }, "Skipping invalid node position in object store");
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
  public async savePositions(entries: ReadonlyArray<readonly [string, GraphNodePosition]>): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    for (const [entityId, position] of entries) {
      this.positions.set(entityId, position);
    }

    await this.store.setMany(GRAPH_NODE_POSITION_STORE_TABLE, entries);

    log.info({ count: entries.length }, "Saved node positions");
  }

  /** Clear every saved node layout position (backs the reset-all control) */
  public async clearAllPositions(): Promise<void> {
    this.positions.clear();
    await this.store.clear(GRAPH_NODE_POSITION_STORE_TABLE);

    log.info("Cleared all node positions");
  }

  public queryRelationships(options: QueryRelationshipOptions): Relationship[] {
    return this.getAllRelationships().filter((relationship) => relationshipMatchesQuery(relationship, options));
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
    // Prevent self-referencing
    if (input.sourceEntityId === input.targetEntityId) {
      throw new AppError(
        "Cannot create a relationship from an entity to itself",
        APP_ERROR_CODES.DUPLICATE_RELATIONSHIP
      );
    }

    // Prevent duplicates
    if (this.queryRelationships(input).length > 0) {
      throw new AppError("Duplicate relationship already exists", APP_ERROR_CODES.DUPLICATE_RELATIONSHIP);
    }

    const relationship: Relationship = {
      id: generateId(),
      sourceEntityId: input.sourceEntityId,
      sourceEntityType: input.sourceEntityType,
      targetEntityId: input.targetEntityId,
      targetEntityType: input.targetEntityType,
      relationshipType: input.relationshipType,
      createdTimestamp: Date.now(),
    };

    this.relationships.set(relationship.id, relationship);
    await this.store.set(RELATIONSHIP_STORE_TABLE, relationship.id, relationship);

    log.info(
      {
        relationshipId: relationship.id,
        source: `${input.sourceEntityType}:${input.sourceEntityId}`,
        target: `${input.targetEntityType}:${input.targetEntityId}`,
      },
      "Relationship created"
    );

    return relationship;
  }

  /**
   * Delete a relationship by ID.
   * @throws AppError with RELATIONSHIP_NOT_FOUND if not found.
   */
  public async deleteRelationship(relationshipId: string): Promise<void> {
    this.getRelationship(relationshipId);

    this.relationships.delete(relationshipId);
    await this.store.delete(RELATIONSHIP_STORE_TABLE, relationshipId);

    log.info({ relationshipId }, "Relationship deleted");
  }

  /**
   * Remove all relationships involving an entity and its saved layout position,
   * returning the removed relationship IDs. Every entity-delete site funnels
   * through here, so both edges and position are cleaned up for all entity types.
   */
  public async removeRelationshipsForEntity(entityId: string): Promise<string[]> {
    const toRemove: string[] = [];

    for (const relationship of this.relationships.values()) {
      if (relationship.sourceEntityId === entityId || relationship.targetEntityId === entityId) {
        toRemove.push(relationship.id);
      }
    }

    for (const relationshipId of toRemove) {
      this.relationships.delete(relationshipId);
      await this.store.delete(RELATIONSHIP_STORE_TABLE, relationshipId);
    }

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
}
