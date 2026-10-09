import {
  ENTITY_TYPE,
  RELATIONSHIP_TYPE,
  SERVER_MESSAGE_TYPE,
  TagSchema,
  type EntityType,
  type Relationship,
  type Tag,
  type TagEdge,
  type TagSnapshot,
} from "@crow-central-agency/shared";
import type { ObjectStoreProvider } from "../../core/store/object-store.types.js";
import type { RelationshipManager } from "../relationship-manager.js";
import type { WsBroadcaster } from "../ws-broadcaster.js";
import type { PendingTagEdge, TagChange } from "./tag-manager.types.js";
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
 * RelationshipManager. A tag left without any TAGGED edge is deleted. Every
 * mutation that changes tagging broadcasts one TAGS_CHANGED once persisted.
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
  public getEntityTags(entityType: EntityType, entityId: string): Tag[] {
    return this.getEntityTagEdges(entityType, entityId).flatMap((relationship) => {
      const tag = this.tagsById.get(relationship.targetEntityId);

      return tag ? [tag] : [];
    });
  }

  /**
   * Every tag and TAGGED edge. With an entity type, only that type's edges and
   * the tags that have at least one of them.
   */
  public getSnapshot(entityType?: EntityType): TagSnapshot {
    const edges = this.relationshipManager
      .queryRelationships({ relationshipType: RELATIONSHIP_TYPE.TAGGED, sourceEntityType: entityType })
      .map((relationship) => this.toTagEdge(relationship));

    if (!entityType) {
      return { tags: Array.from(this.tagsById.values()), edges };
    }

    const usedTagIds = new Set(edges.map((edge) => edge.tagId));
    const tags = Array.from(usedTagIds).flatMap((tagId) => {
      const tag = this.tagsById.get(tagId);

      return tag ? [tag] : [];
    });

    return { tags, edges };
  }

  /**
   * Replace the tags of each entity in the map with the given names. An empty
   * list clears the entity's tags.
   * @throws AppError with VALIDATION for a TAG entity type or an empty entity id.
   */
  public setEntityTags(entityType: EntityType, tagNamesByEntityId: ReadonlyMap<string, string[]>): Promise<void> {
    return this.serialize(() => this.applyEntityTags(entityType, tagNamesByEntityId));
  }

  /**
   * Tag an entity with an existing tag.
   * @throws AppError with VALIDATION for a TAG entity, TAG_NOT_FOUND if the tag
   *         does not exist, or DUPLICATE_RELATIONSHIP if the entity already has the tag.
   */
  public tagEntity(entityType: EntityType, entityId: string, tagId: string): Promise<Relationship> {
    return this.serialize(async () => {
      this.assertTaggableEntityType(entityType);
      this.getTag(tagId);

      const relationship = await this.relationshipManager.createRelationship({
        sourceEntityId: entityId,
        sourceEntityType: entityType,
        targetEntityId: tagId,
        targetEntityType: ENTITY_TYPE.TAG,
        relationshipType: RELATIONSHIP_TYPE.TAGGED,
      });
      this.broadcastChange({
        createdTags: [],
        removedEdges: [],
        addedEdges: [this.toTagEdge(relationship)],
        deletedTagIds: [],
      });

      return relationship;
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
      this.broadcastChange({
        createdTags: [],
        removedEdges: [this.toTagEdge(relationship)],
        addedEdges: [],
        deletedTagIds,
      });
    });
  }

  /**
   * Move every edge of the old entity ids to the new ones, with saved graph
   * positions, through RelationshipManager.rekeyEntities. Each moved TAGGED
   * edge is announced as removed under the old id and added under the new one.
   */
  public rekeyEntities(idMap: ReadonlyMap<string, string>): Promise<void> {
    return this.serialize(async () => {
      const removedEdges: TagEdge[] = [];
      const addedEdges: TagEdge[] = [];
      for (const [oldId, newId] of idMap) {
        const relationships = this.relationshipManager.queryRelationships({
          sourceEntityId: oldId,
          relationshipType: RELATIONSHIP_TYPE.TAGGED,
        });
        for (const relationship of relationships) {
          const edge = this.toTagEdge(relationship);
          removedEdges.push(edge);
          addedEdges.push({ ...edge, entityId: newId });
        }
      }

      await this.relationshipManager.rekeyEntities(idMap);
      this.broadcastChange({ createdTags: [], removedEdges, addedEdges, deletedTagIds: [] });
    });
  }

  private async applyEntityTags(
    entityType: EntityType,
    tagNamesByEntityId: ReadonlyMap<string, string[]>
  ): Promise<void> {
    const removedRelationships: Relationship[] = [];
    const removedTagIds = new Set<string>();
    const pendingEdges: PendingTagEdge[] = [];
    this.assertTaggableEntityType(entityType);

    for (const [entityId, tagNames] of tagNamesByEntityId) {
      if (!entityId) {
        throw new AppError("Entity id is required to set tags", APP_ERROR_CODES.VALIDATION);
      }

      const desiredNames = new Set(normalizeTags(tagNames));
      const keptNames = new Set<string>();
      for (const relationship of this.getEntityTagEdges(entityType, entityId)) {
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
          pendingEdges.push({ entityId, tagName });
        }
      }
    }

    const createdTags = await this.createMissingTags(pendingEdges.map((pendingEdge) => pendingEdge.tagName));
    await this.relationshipManager.deleteRelationships(removedRelationships.map((relationship) => relationship.id));
    const addedRelationships = await this.relationshipManager.createRelationships(
      pendingEdges.map((pendingEdge) => ({
        sourceEntityId: pendingEdge.entityId,
        sourceEntityType: entityType,
        targetEntityId: this.requireTagByName(pendingEdge.tagName).id,
        targetEntityType: ENTITY_TYPE.TAG,
        relationshipType: RELATIONSHIP_TYPE.TAGGED,
      }))
    );
    const deletedTagIds = await this.deleteUnusedTags(Array.from(removedTagIds));

    this.broadcastChange({
      createdTags,
      removedEdges: removedRelationships.map((relationship) => this.toTagEdge(relationship)),
      addedEdges: addedRelationships.map((relationship) => this.toTagEdge(relationship)),
      deletedTagIds,
    });

    if (removedRelationships.length > 0 || pendingEdges.length > 0) {
      log.info({ entityType, removed: removedRelationships.length, added: pendingEdges.length }, "Entity tags updated");
    }
  }

  private assertTaggableEntityType(entityType: EntityType): void {
    if (entityType === ENTITY_TYPE.TAG) {
      throw new AppError("A tag cannot be tagged", APP_ERROR_CODES.VALIDATION);
    }
  }

  private getEntityTagEdges(entityType: EntityType, entityId: string): Relationship[] {
    return this.relationshipManager.queryRelationships({
      sourceEntityId: entityId,
      sourceEntityType: entityType,
      relationshipType: RELATIONSHIP_TYPE.TAGGED,
    });
  }

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

  private toTagEdge(relationship: Relationship): TagEdge {
    return {
      tagId: relationship.targetEntityId,
      entityType: relationship.sourceEntityType,
      entityId: relationship.sourceEntityId,
    };
  }

  /** Broadcast one TAGS_CHANGED, unless the mutation changed nothing */
  private broadcastChange(change: TagChange): void {
    const isEmpty =
      change.createdTags.length === 0 &&
      change.removedEdges.length === 0 &&
      change.addedEdges.length === 0 &&
      change.deletedTagIds.length === 0;
    if (isEmpty) {
      return;
    }

    this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.TAGS_CHANGED, ...change });
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
