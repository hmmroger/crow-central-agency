import {
  ENTITY_TYPE,
  RELATIONSHIP_TYPE,
  TagSchema,
  type EntityType,
  type Relationship,
  type Tag,
} from "@crow-central-agency/shared";
import type { ObjectStoreProvider } from "../../core/store/object-store.types.js";
import type { RelationshipManager } from "../relationship-manager.js";
import type { PendingTagEdge } from "./tag-manager.types.js";
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
 * RelationshipManager. A tag left without any TAGGED edge is deleted.
 */
export class TagManager {
  private tagsById = new Map<string, Tag>();
  private tagsByName = new Map<string, Tag>();
  private mutationChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: ObjectStoreProvider,
    private readonly relationshipManager: RelationshipManager
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

      return this.relationshipManager.createRelationship({
        sourceEntityId: entityId,
        sourceEntityType: entityType,
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
      await this.deleteUnusedTags([relationship.targetEntityId]);
    });
  }

  private async applyEntityTags(
    entityType: EntityType,
    tagNamesByEntityId: ReadonlyMap<string, string[]>
  ): Promise<void> {
    const removedRelationshipIds: string[] = [];
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
          removedRelationshipIds.push(relationship.id);
          removedTagIds.add(relationship.targetEntityId);
        }
      }

      for (const tagName of desiredNames) {
        if (!keptNames.has(tagName)) {
          pendingEdges.push({ entityId, tagName });
        }
      }
    }

    await this.createMissingTags(pendingEdges.map((pendingEdge) => pendingEdge.tagName));
    await this.relationshipManager.deleteRelationships(removedRelationshipIds);
    await this.relationshipManager.createRelationships(
      pendingEdges.map((pendingEdge) => ({
        sourceEntityId: pendingEdge.entityId,
        sourceEntityType: entityType,
        targetEntityId: this.requireTagByName(pendingEdge.tagName).id,
        targetEntityType: ENTITY_TYPE.TAG,
        relationshipType: RELATIONSHIP_TYPE.TAGGED,
      }))
    );
    await this.deleteUnusedTags(Array.from(removedTagIds));

    if (removedRelationshipIds.length > 0 || pendingEdges.length > 0) {
      log.info(
        { entityType, removed: removedRelationshipIds.length, added: pendingEdges.length },
        "Entity tags updated"
      );
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

  private async createMissingTags(tagNames: ReadonlyArray<string>): Promise<void> {
    const createdTimestamp = Date.now();
    const newTags = new Map<string, Tag>();
    for (const tagName of tagNames) {
      if (!this.tagsByName.has(tagName) && !newTags.has(tagName)) {
        newTags.set(tagName, { id: generateId(), name: tagName, createdTimestamp });
      }
    }

    if (newTags.size === 0) {
      return;
    }

    for (const tag of newTags.values()) {
      this.putTag(tag);
    }

    await this.store.setMany(
      TAG_STORE_TABLE,
      Array.from(newTags.values(), (tag) => [tag.id, tag] as const)
    );

    log.info({ names: Array.from(newTags.keys()) }, "Tags created");
  }

  private async deleteUnusedTags(candidateTagIds: ReadonlyArray<string>): Promise<void> {
    const unusedTags = candidateTagIds.flatMap((tagId) => {
      const tag = this.tagsById.get(tagId);
      const isUsed =
        this.relationshipManager.queryRelationships({
          targetEntityId: tagId,
          relationshipType: RELATIONSHIP_TYPE.TAGGED,
        }).length > 0;

      return tag && !isUsed ? [tag] : [];
    });

    if (unusedTags.length === 0) {
      return;
    }

    for (const tag of unusedTags) {
      this.tagsById.delete(tag.id);
      this.tagsByName.delete(tag.name);
    }

    await this.store.deleteMany(
      TAG_STORE_TABLE,
      unusedTags.map((tag) => tag.id)
    );

    log.info({ names: unusedTags.map((tag) => tag.name) }, "Unused tags deleted");
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
