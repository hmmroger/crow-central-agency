import {
  ENTITY_TYPE,
  RELATIONSHIP_TYPE,
  SERVER_MESSAGE_TYPE,
  TagSchema,
  type Entity,
  type EntityType,
  type Relationship,
  type Tag,
} from "@crow-central-agency/shared";
import type { ObjectStoreProvider } from "../../core/store/object-store.types.js";
import type { RelationshipManager } from "../relationship-manager.js";
import type { WsBroadcaster } from "../ws-broadcaster.js";
import type { EntityTagNames, PendingTagEdge } from "./tag-manager.types.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import { generateId } from "../../utils/id-utils.js";
import { logger } from "../../utils/logger.js";
import { normalizeTags } from "./tag-name.js";

const log = logger.child({ context: "tag-manager" });

/** Object store table name for tag records */
export const TAG_STORE_TABLE = "tags";

/**
 * Owns tag records and the tagging rules. An entity is tagged by a TAGGED edge
 * from the entity to the tag; edges are read and written only through the
 * RelationshipManager, which announces them. A tag left without any TAGGED edge
 * is deleted. TAGS_CHANGED carries tag records only: created tags are announced
 * before the edges that use them are written, and tags deleted as unused after
 * the edge removal that left them unused.
 */
export class TagManager {
  private tagsById = new Map<string, Tag>();
  private tagsByName = new Map<string, Tag>();
  private mutationChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: ObjectStoreProvider,
    private readonly relationshipManager: RelationshipManager,
    private readonly broadcaster: WsBroadcaster
  ) {}

  /** Load tag records from the object store */
  public async initialize(): Promise<void> {
    const entries = await this.store.getAll<Tag>(TAG_STORE_TABLE);
    for (const entry of entries) {
      const result = TagSchema.safeParse(entry.value);
      if (result.success) {
        this.putTag(result.data);
      } else {
        log.warn({ issues: result.error.issues }, "Skipping invalid tag in object store");
      }
    }

    await this.deleteUnusedTags(Array.from(this.tagsById.keys()));

    log.info({ tags: this.tagsById.size }, "TagManager initialized");
  }

  /**
   * Get a tag by ID.
   * @throws AppError with TAG_NOT_FOUND if not found.
   */
  public getTag(tagId: string): Tag {
    const tag = this.tagsById.get(tagId);
    if (!tag) {
      throw new AppError(`Tag not found: ${tagId}`, APP_ERROR_CODES.TAG_NOT_FOUND);
    }

    return tag;
  }

  /** Find a tag by name; the name is normalized before lookup */
  public findTagByName(name: string): Tag | undefined {
    const [normalizedName] = normalizeTags([name]);

    return normalizedName ? this.tagsByName.get(normalizedName) : undefined;
  }

  /** The tags of one entity; an untagged entity has none */
  public getEntityTags(entity: Entity): Tag[] {
    return this.getEntityTagEdges(entity).flatMap((relationship) => {
      const tag = this.tagsById.get(relationship.targetEntityId);

      return tag ? [tag] : [];
    });
  }

  /** Every tag record */
  public getAllTags(): Tag[] {
    return Array.from(this.tagsById.values());
  }

  /**
   * Replace the tags of each listed entity with the given names, in one
   * mutation; entity types can be mixed. An empty list clears the entity's tags.
   * @throws AppError with VALIDATION for a TAG entity, an empty entity id, or
   *         the same entity listed twice.
   */
  public setEntityTags(entityTagNames: ReadonlyArray<EntityTagNames>): Promise<void> {
    return this.serialize(() => this.applyEntityTags(entityTagNames));
  }

  /**
   * Tag an entity with an existing tag.
   * @throws AppError with VALIDATION for a TAG entity, TAG_NOT_FOUND if the tag
   *         does not exist, or DUPLICATE_RELATIONSHIP if the entity already has the tag.
   */
  public tagEntity(entity: Entity, tagId: string): Promise<Relationship> {
    return this.serialize(async () => {
      this.assertTaggableEntityType(entity.entityType);
      this.getTag(tagId);

      return this.relationshipManager.createRelationship({
        sourceEntityId: entity.id,
        sourceEntityType: entity.entityType,
        targetEntityId: tagId,
        targetEntityType: ENTITY_TYPE.TAG,
        relationshipType: RELATIONSHIP_TYPE.TAGGED,
      });
    });
  }

  /**
   * Remove one TAGGED edge, deleting the tag when it was its last edge.
   * @throws AppError with RELATIONSHIP_NOT_FOUND if not found, or VALIDATION
   *         if the relationship is not TAGGED.
   */
  public untagEntity(relationshipId: string): Promise<void> {
    return this.serialize(async () => {
      const relationship = this.relationshipManager.getRelationship(relationshipId);
      if (relationship.relationshipType !== RELATIONSHIP_TYPE.TAGGED) {
        throw new AppError(`Not a TAGGED relationship: ${relationshipId}`, APP_ERROR_CODES.VALIDATION);
      }

      await this.relationshipManager.deleteRelationship(relationshipId);
      const deletedTagIds = await this.deleteUnusedTags([relationship.targetEntityId]);
      this.broadcastChange([], deletedTagIds);
    });
  }

  /**
   * Move the TAGGED edges of entities whose id changed, given each previous id
   * and the entity as it is now.
   */
  public changeEntityIds(currentEntitiesByPreviousId: ReadonlyMap<string, Entity>): Promise<void> {
    return this.serialize(async () => {
      const idMap = new Map<string, string>();
      for (const [previousId, entity] of currentEntitiesByPreviousId) {
        idMap.set(previousId, entity.id);
      }

      await this.relationshipManager.rekeyEntities(idMap, { relationshipType: RELATIONSHIP_TYPE.TAGGED });
    });
  }

  private async applyEntityTags(entityTagNames: ReadonlyArray<EntityTagNames>): Promise<void> {
    const removedRelationships: Relationship[] = [];
    const removedTagIds = new Set<string>();
    const pendingEdges: PendingTagEdge[] = [];
    const seenEntityKeys = new Set<string>();

    for (const { entity, tagNames } of entityTagNames) {
      this.assertTaggableEntityType(entity.entityType);
      if (!entity.id) {
        throw new AppError("Entity id is required to set tags", APP_ERROR_CODES.VALIDATION);
      }

      const entityKey = JSON.stringify([entity.entityType, entity.id]);
      if (seenEntityKeys.has(entityKey)) {
        throw new AppError(`Entity listed twice: ${entity.id}`, APP_ERROR_CODES.VALIDATION);
      }

      seenEntityKeys.add(entityKey);

      const desiredNames = new Set(normalizeTags(tagNames));
      const keptNames = new Set<string>();
      for (const relationship of this.getEntityTagEdges(entity)) {
        const tag = this.tagsById.get(relationship.targetEntityId);
        if (tag && desiredNames.has(tag.name)) {
          keptNames.add(tag.name);
        } else {
          removedRelationships.push(relationship);
          removedTagIds.add(relationship.targetEntityId);
        }
      }

      for (const tagName of desiredNames) {
        if (!keptNames.has(tagName)) {
          pendingEdges.push({ entity, tagName });
        }
      }
    }

    const createdTags = await this.createMissingTags(pendingEdges.map((pendingEdge) => pendingEdge.tagName));
    this.broadcastChange(createdTags, []);
    await this.relationshipManager.deleteRelationships(removedRelationships.map((relationship) => relationship.id));
    await this.relationshipManager.createRelationships(
      pendingEdges.map((pendingEdge) => ({
        sourceEntityId: pendingEdge.entity.id,
        sourceEntityType: pendingEdge.entity.entityType,
        targetEntityId: this.requireTagByName(pendingEdge.tagName).id,
        targetEntityType: ENTITY_TYPE.TAG,
        relationshipType: RELATIONSHIP_TYPE.TAGGED,
      }))
    );
    const deletedTagIds = await this.deleteUnusedTags(Array.from(removedTagIds));
    this.broadcastChange([], deletedTagIds);

    if (removedRelationships.length > 0 || pendingEdges.length > 0) {
      log.info({ removed: removedRelationships.length, added: pendingEdges.length }, "Entity tags updated");
    }
  }

  private assertTaggableEntityType(entityType: EntityType): void {
    if (entityType === ENTITY_TYPE.TAG) {
      throw new AppError("A tag cannot be tagged", APP_ERROR_CODES.VALIDATION);
    }
  }

  private getEntityTagEdges(entity: Entity): Relationship[] {
    return this.relationshipManager.queryRelationships({
      sourceEntityId: entity.id,
      sourceEntityType: entity.entityType,
      relationshipType: RELATIONSHIP_TYPE.TAGGED,
    });
  }

  /** Create and persist the tags not yet known by name, returning them */
  private async createMissingTags(tagNames: ReadonlyArray<string>): Promise<Tag[]> {
    const createdTimestamp = Date.now();
    const newTags = new Map<string, Tag>();
    for (const tagName of tagNames) {
      if (!this.tagsByName.has(tagName) && !newTags.has(tagName)) {
        newTags.set(tagName, { id: generateId(), name: tagName, createdTimestamp });
      }
    }

    const createdTags = Array.from(newTags.values());
    if (createdTags.length === 0) {
      return createdTags;
    }

    for (const tag of createdTags) {
      this.putTag(tag);
    }

    await this.store.setMany(
      TAG_STORE_TABLE,
      createdTags.map((tag) => [tag.id, tag] as const)
    );

    log.info({ names: Array.from(newTags.keys()) }, "Tags created");

    return createdTags;
  }

  /** Delete the candidate tags left without a TAGGED edge, returning their ids */
  private async deleteUnusedTags(candidateTagIds: ReadonlyArray<string>): Promise<string[]> {
    const unusedTags = candidateTagIds.flatMap((tagId) => {
      const tag = this.tagsById.get(tagId);
      const isUsed =
        this.relationshipManager.queryRelationships({
          targetEntityId: tagId,
          relationshipType: RELATIONSHIP_TYPE.TAGGED,
        }).length > 0;

      return tag && !isUsed ? [tag] : [];
    });

    const unusedTagIds = unusedTags.map((tag) => tag.id);
    if (unusedTagIds.length === 0) {
      return unusedTagIds;
    }

    for (const tag of unusedTags) {
      this.tagsById.delete(tag.id);
      this.tagsByName.delete(tag.name);
    }

    await this.store.deleteMany(TAG_STORE_TABLE, unusedTagIds);

    log.info({ names: unusedTags.map((tag) => tag.name) }, "Unused tags deleted");

    return unusedTagIds;
  }

  /** Broadcast one TAGS_CHANGED, unless no tag record changed */
  private broadcastChange(upserted: Tag[], deletedIds: string[]): void {
    if (upserted.length === 0 && deletedIds.length === 0) {
      return;
    }

    this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.TAGS_CHANGED, upserted, deletedIds });
  }

  private requireTagByName(tagName: string): Tag {
    const tag = this.tagsByName.get(tagName);
    if (!tag) {
      throw new AppError(`Tag not found: ${tagName}`, APP_ERROR_CODES.TAG_NOT_FOUND);
    }

    return tag;
  }

  private putTag(tag: Tag): void {
    this.tagsById.set(tag.id, tag);
    this.tagsByName.set(tag.name, tag);
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationChain.then(operation);
    this.mutationChain = next.then(
      () => undefined,
      () => undefined
    );

    return next;
  }
}
