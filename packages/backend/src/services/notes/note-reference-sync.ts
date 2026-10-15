import {
  ENTITY_TYPE,
  RELATIONSHIP_TYPE,
  type CreateRelationshipInput,
  type Entity,
  type NoteMetadata,
  type Relationship,
} from "@crow-central-agency/shared";
import type { RelationshipManager } from "../relationship-manager.js";
import { logger } from "../../utils/logger.js";
import { SerialQueue } from "../../utils/serial-queue.js";
import type { WikilinkResolver } from "./wikilink-resolver.js";

const log = logger.child({ context: "note-reference-sync" });

/**
 * Owns the wikilink and embed targets of every live text note and keeps each
 * note's REFERENCE edges equal to what its targets resolve to: one edge per
 * resolved live entry, none to the note itself. Edges are written only through
 * the RelationshipManager, which announces them, and only where they differ.
 * Every call takes the resolver over the current live index.
 */
export class NoteReferenceSync {
  private readonly targetsByNoteId = new Map<string, ReadonlyArray<string>>();
  private readonly mutationQueue = new SerialQueue();

  constructor(private readonly relationshipManager: RelationshipManager) {}

  /** Replace the targets of each listed note and sync its edges */
  public setNoteTargets(
    targetsByNoteId: ReadonlyMap<string, ReadonlyArray<string>>,
    resolver: WikilinkResolver
  ): Promise<void> {
    return this.mutationQueue.run(async () => {
      for (const [noteId, targets] of targetsByNoteId) {
        this.targetsByNoteId.set(noteId, targets);
      }

      await this.syncEdges(targetsByNoteId.keys(), resolver);
    });
  }

  /** Re-resolve the notes holding a target with a segment equal to any of `names` */
  public resolveNamedTargets(names: Iterable<string>, resolver: WikilinkResolver): Promise<void> {
    const comparableNames = new Set(Array.from(names, (name) => resolver.toComparableName(name)));

    return this.mutationQueue.run(async () => {
      const noteIds: string[] = [];
      for (const [noteId, targets] of this.targetsByNoteId) {
        if (this.holdsAnyName(targets, comparableNames, resolver)) {
          noteIds.push(noteId);
        }
      }

      await this.syncEdges(noteIds, resolver);
    });
  }

  /**
   * Move the targets and REFERENCE edges of entries whose id changed, given each
   * previous id and the entry as it is now.
   */
  public changeEntityIds(currentEntitiesByPreviousId: ReadonlyMap<string, Entity>): Promise<void> {
    const idMap = new Map<string, string>();
    for (const [previousId, entity] of currentEntitiesByPreviousId) {
      idMap.set(previousId, entity.id);
    }

    return this.mutationQueue.run(async () => {
      const movedTargets = new Map<string, ReadonlyArray<string>>();
      for (const [previousId, nextId] of idMap) {
        const targets = this.targetsByNoteId.get(previousId);
        if (targets) {
          this.targetsByNoteId.delete(previousId);
          movedTargets.set(nextId, targets);
        }
      }

      for (const [noteId, targets] of movedTargets) {
        this.targetsByNoteId.set(noteId, targets);
      }

      await this.relationshipManager.rekeyEntities(idMap, { relationshipType: RELATIONSHIP_TYPE.REFERENCE });
    });
  }

  /** Forget the targets of the given notes and remove their REFERENCE edges */
  public dropNotes(noteIds: Iterable<string>): Promise<void> {
    const droppedIds = Array.from(noteIds);

    return this.mutationQueue.run(async () => {
      const removedIds: string[] = [];
      for (const noteId of droppedIds) {
        this.targetsByNoteId.delete(noteId);
        for (const relationship of this.getReferenceEdges(noteId)) {
          removedIds.push(relationship.id);
        }
      }

      await this.relationshipManager.deleteRelationships(removedIds);
    });
  }

  /** Bring the edges of each note in line with what its targets resolve to now, in one delete and one create */
  private async syncEdges(noteIds: Iterable<string>, resolver: WikilinkResolver): Promise<void> {
    const removedIds: string[] = [];
    const createdInputs: CreateRelationshipInput[] = [];
    for (const noteId of noteIds) {
      const resolvedEntries = this.resolveTargets(noteId, resolver);
      for (const relationship of this.getReferenceEdges(noteId)) {
        const resolvedEntry = resolvedEntries.get(relationship.targetEntityId);
        if (resolvedEntry?.entityType === relationship.targetEntityType) {
          resolvedEntries.delete(relationship.targetEntityId);
        } else {
          removedIds.push(relationship.id);
        }
      }

      for (const entry of resolvedEntries.values()) {
        createdInputs.push({
          sourceEntityId: noteId,
          sourceEntityType: ENTITY_TYPE.NOTE,
          targetEntityId: entry.id,
          targetEntityType: entry.entityType,
          relationshipType: RELATIONSHIP_TYPE.REFERENCE,
        });
      }
    }

    await this.relationshipManager.deleteRelationships(removedIds);
    await this.relationshipManager.createRelationships(createdInputs);

    if (removedIds.length > 0 || createdInputs.length > 0) {
      log.info({ removed: removedIds.length, added: createdInputs.length }, "Note references updated");
    }
  }

  /** The live entries a note's targets resolve to, by id, without the note itself */
  private resolveTargets(noteId: string, resolver: WikilinkResolver): Map<string, NoteMetadata> {
    const resolvedEntries = new Map<string, NoteMetadata>();
    for (const target of this.targetsByNoteId.get(noteId) ?? []) {
      const entry = resolver.findNote(target);
      if (entry && entry.id !== noteId) {
        resolvedEntries.set(entry.id, entry);
      }
    }

    return resolvedEntries;
  }

  private holdsAnyName(
    targets: ReadonlyArray<string>,
    comparableNames: ReadonlySet<string>,
    resolver: WikilinkResolver
  ): boolean {
    for (const target of targets) {
      if (resolver.toTargetNames(target).some((name) => comparableNames.has(name))) {
        return true;
      }
    }

    return false;
  }

  private getReferenceEdges(noteId: string): Relationship[] {
    return this.relationshipManager.queryRelationships({
      sourceEntityId: noteId,
      sourceEntityType: ENTITY_TYPE.NOTE,
      relationshipType: RELATIONSHIP_TYPE.REFERENCE,
    });
  }
}
