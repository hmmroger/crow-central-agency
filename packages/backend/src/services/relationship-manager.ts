import { RelationshipSchema, type CreateRelationshipInput, type Relationship } from "@crow-central-agency/shared";
import type { QueryRelationshipOptions } from "./relationship-manager.types.js";
import type { ObjectStoreProvider } from "../core/store/object-store.types.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { generateId } from "../utils/id-utils.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "relationship-manager" });

/** Object store table name for entity relationships */
export const RELATIONSHIP_STORE_TABLE = "relationships";

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
 * Generic relationship/edge engine over the object store.
 * Owns edge persistence, queries, and reachability checks; entity semantics
 * (circle membership rules, virtual relationships) live with the callers.
 */
export class RelationshipManager {
  private relationships = new Map<string, Relationship>();

  constructor(private readonly store: ObjectStoreProvider) {}

  /** Load relationships from the object store */
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

    log.info({ relationships: this.relationships.size }, "RelationshipManager initialized");
  }

  /** Get all persisted relationships */
  public getAllRelationships(): Relationship[] {
    return Array.from(this.relationships.values());
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

  /** Remove all relationships involving an entity and return the removed IDs */
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
