import type { EntityType, Tag, TagEdge, TagSnapshot, TagsChangedWsMessage } from "@crow-central-agency/shared";

/**
 * Tags and their edges to entities of the tracked types. A tag is kept only
 * while it has at least one tracked edge, as in a filtered snapshot. Snapshots
 * share the maps, so a new snapshot is how a change is published; only the
 * provider mutates it.
 */
export class TagsIndex {
  constructor(
    private readonly entityTypes: ReadonlySet<EntityType>,
    private readonly tagsById = new Map<string, Tag>(),
    private readonly entityIdsByTagId = new Map<string, Map<EntityType, Set<string>>>()
  ) {}

  /** Every tag, in name order */
  public readonly getTags = (): Tag[] =>
    Array.from(this.tagsById.values()).sort((first, second) => first.name.localeCompare(second.name));

  public readonly getEntityIds = (tagId: string, entityType: EntityType): string[] =>
    Array.from(this.entityIdsByTagId.get(tagId)?.get(entityType) ?? []);

  public replace(snapshot: TagSnapshot): void {
    this.tagsById.clear();
    this.entityIdsByTagId.clear();
    for (const tag of snapshot.tags) {
      this.tagsById.set(tag.id, tag);
    }

    for (const edge of snapshot.edges) {
      this.addEdge(edge);
    }

    this.pruneUnusedTags(this.tagsById.keys());
  }

  /** Apply one TAGS_CHANGED in field order: tags, removed edges, added edges, deleted tags */
  public apply(message: TagsChangedWsMessage): void {
    const trackedAddedEdges = message.addedEdges.filter((edge) => this.entityTypes.has(edge.entity.entityType));
    const addedTagIds = new Set(trackedAddedEdges.map((edge) => edge.tagId));
    for (const tag of message.tags) {
      if (addedTagIds.has(tag.id)) {
        this.tagsById.set(tag.id, tag);
      }
    }

    for (const edge of message.removedEdges) {
      this.entityIdsByTagId.get(edge.tagId)?.get(edge.entity.entityType)?.delete(edge.entity.id);
    }

    for (const edge of trackedAddedEdges) {
      this.addEdge(edge);
    }

    for (const tagId of message.deletedTagIds) {
      this.tagsById.delete(tagId);
      this.entityIdsByTagId.delete(tagId);
    }

    this.pruneUnusedTags(message.removedEdges.map((edge) => edge.tagId));
  }

  public snapshot(): TagsIndex {
    return new TagsIndex(this.entityTypes, this.tagsById, this.entityIdsByTagId);
  }

  private addEdge(edge: TagEdge): void {
    if (!this.entityTypes.has(edge.entity.entityType) || !this.tagsById.has(edge.tagId)) {
      return;
    }

    let entityIdsByType = this.entityIdsByTagId.get(edge.tagId);
    if (!entityIdsByType) {
      entityIdsByType = new Map();
      this.entityIdsByTagId.set(edge.tagId, entityIdsByType);
    }

    const entityIds = entityIdsByType.get(edge.entity.entityType);
    if (entityIds) {
      entityIds.add(edge.entity.id);
    } else {
      entityIdsByType.set(edge.entity.entityType, new Set([edge.entity.id]));
    }
  }

  /** Drop the candidate tags left without a tracked edge */
  private pruneUnusedTags(candidateTagIds: Iterable<string>): void {
    for (const tagId of Array.from(candidateTagIds)) {
      const entityIdsByType = this.entityIdsByTagId.get(tagId);
      const isUsed = Array.from(entityIdsByType?.values() ?? []).some((entityIds) => entityIds.size > 0);
      if (!isUsed) {
        this.tagsById.delete(tagId);
        this.entityIdsByTagId.delete(tagId);
      }
    }
  }
}
