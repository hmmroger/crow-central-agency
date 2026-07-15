import {
  ENTITY_TYPE,
  FRAGMENT_KIND,
  FRAGMENT_MAX_WORDS,
  FRAGMENT_REFLECTION_AGENT_ID,
  FragmentSchema,
  RELATIONSHIP_TYPE,
  type Fragment,
  type FragmentKind,
  type Relationship,
} from "@crow-central-agency/shared";
import { EventBus } from "../../core/event-bus/event-bus.js";
import type { ObjectStoreProvider } from "../../core/store/object-store.types.js";
import type { RelationshipManager } from "../relationship-manager.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import { generateId } from "../../utils/id-utils.js";
import { logger } from "../../utils/logger.js";
import type {
  CreateFragmentInput,
  FragmentCueIndexEntry,
  FragmentManagerEvents,
  FragmentParent,
  UpdateFragmentInput,
} from "./fragment-manager.types.js";

const log = logger.child({ context: "fragment-manager" });

/** Folder store table holding full fragment objects (source of truth) */
export const FRAGMENT_STORE_TABLE = "fragments";

/** Object store table holding the derived hot-tier cue index */
export const FRAGMENT_INDEX_STORE_TABLE = "fragments-index";

/** Fragment kinds that may hang directly off an agent (top-level ASSOCIATION parent) */
const AGENT_PARENT_KINDS: ReadonlySet<FragmentKind> = new Set([
  FRAGMENT_KIND.FEEDBACK,
  FRAGMENT_KIND.LESSON,
  FRAGMENT_KIND.DOMAIN,
]);

/** Parent-rule matrix: child kind → fragment kinds allowed as its LINK parent */
const FRAGMENT_PARENT_KINDS: Record<FragmentKind, ReadonlySet<FragmentKind>> = {
  [FRAGMENT_KIND.FEEDBACK]: new Set([FRAGMENT_KIND.FEEDBACK, FRAGMENT_KIND.DOMAIN]),
  [FRAGMENT_KIND.LESSON]: new Set([FRAGMENT_KIND.LESSON, FRAGMENT_KIND.DOMAIN]),
  [FRAGMENT_KIND.DOMAIN]: new Set([FRAGMENT_KIND.FEEDBACK, FRAGMENT_KIND.LESSON, FRAGMENT_KIND.DOMAIN]),
  [FRAGMENT_KIND.KNOWLEDGE]: new Set([FRAGMENT_KIND.DOMAIN]),
};

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

/**
 * Manages fragment persistence across two storage tiers:
 * - fragments (folder store, cold): full fragment incl. body + usage stats.
 * - fragments-index (object store, hot): {id, kind, cue, createdTimestamp} per fragment.
 * Create/update/delete write through to both tiers; body-only and usage-stat
 * writes skip the index since it holds neither.
 *
 * Also the domain authority over fragment graph edges (ASSOCIATION/LINK via
 * RelationshipManager): the graph is a DAG — multiple parents are legal —
 * and the intrinsic invariants (parent rules, word cap, acyclicity) live
 * inside the pure ops, caller-independent. A fragment exists exactly as long
 * as something still links to it: unlinkFragment cascade-collects whatever
 * loses its last incoming edge. Accessibility is owned here behind the one
 * opaque isFragmentAccessible API; the fragment tools enforce it per call.
 */
export class FragmentManager extends EventBus<FragmentManagerEvents> {
  constructor(
    private readonly fragmentStore: ObjectStoreProvider,
    private readonly indexStore: ObjectStoreProvider,
    private readonly relationshipManager: RelationshipManager
  ) {
    super();
  }

  /** Rebuild the cue index from the fragment store so startup never carries drift */
  public async initialize(): Promise<void> {
    await this.rebuildIndex();
  }

  /**
   * Create a fragment and its required parent edge (agent ASSOCIATION or
   * fragment LINK). All write-time invariants are validated before anything
   * is persisted; a failed edge write rolls the fragment back.
   */
  public async createFragment(input: CreateFragmentInput): Promise<Fragment> {
    this.assertBodyWithinWordCap(input.body);
    await this.validateParent(input.kind, input.parent);

    const now = Date.now();
    const fragment: Fragment = {
      id: generateId(),
      kind: input.kind,
      cue: input.cue,
      body: input.body,
      usageCount: 0,
      createdTimestamp: now,
      updatedTimestamp: now,
    };

    await this.fragmentStore.set(FRAGMENT_STORE_TABLE, fragment.id, fragment);
    await this.indexStore.set(FRAGMENT_INDEX_STORE_TABLE, fragment.id, this.toIndexEntry(fragment));

    try {
      await this.createParentEdge(fragment.id, input.parent);
    } catch (error) {
      await this.fragmentStore.delete(FRAGMENT_STORE_TABLE, fragment.id);
      await this.indexStore.delete(FRAGMENT_INDEX_STORE_TABLE, fragment.id);
      throw error;
    }

    log.info({ fragmentId: fragment.id, kind: fragment.kind }, "Fragment created");
    this.emit("fragmentCreated", { fragment });

    return fragment;
  }

  /**
   * Read the full fragment from the source-of-truth tier.
   * @throws AppError with FRAGMENT_NOT_FOUND if the fragment does not exist.
   */
  public async readFragment(fragmentId: string): Promise<Fragment> {
    return this.readFragmentOrThrow(fragmentId);
  }

  /**
   * Update a fragment's cue and/or body.
   * @throws AppError with FRAGMENT_NOT_FOUND if the fragment does not exist.
   */
  public async updateFragment(fragmentId: string, input: UpdateFragmentInput): Promise<Fragment> {
    if (input.body !== undefined) {
      this.assertBodyWithinWordCap(input.body);
    }

    const existing = await this.readFragmentOrThrow(fragmentId);
    this.assertNoUpdateConflict(existing, input.expectedUpdatedTimestamp);

    const fragment: Fragment = {
      ...existing,
      cue: input.cue ?? existing.cue,
      body: input.body ?? existing.body,
      updatedTimestamp: Date.now(),
    };

    await this.fragmentStore.set(FRAGMENT_STORE_TABLE, fragmentId, fragment);
    // Body-only writes skip the derived index; it holds no body
    if (fragment.cue !== existing.cue) {
      await this.indexStore.set(FRAGMENT_INDEX_STORE_TABLE, fragmentId, this.toIndexEntry(fragment));
    }

    log.info({ fragmentId }, "Fragment updated");
    this.emit("fragmentUpdated", { fragment });

    return fragment;
  }

  /**
   * Record a recall: bump usage stats in the truth tier only.
   * Leaves updatedTimestamp untouched — recalls are not content changes.
   */
  public async recordRecall(fragmentId: string): Promise<Fragment> {
    const existing = await this.readFragmentOrThrow(fragmentId);

    const fragment: Fragment = {
      ...existing,
      usageCount: existing.usageCount + 1,
      lastRecalledTimestamp: Date.now(),
    };

    await this.fragmentStore.set(FRAGMENT_STORE_TABLE, fragmentId, fragment);

    return fragment;
  }

  /**
   * Associate an agent to a fragment (top-level anchor or sharing). Agent id
   * validity is the caller's responsibility; fragment existence and the
   * agent-parent kind matrix are validated here.
   * @throws AppError with DUPLICATE_RELATIONSHIP if the association already exists.
   */
  public async createAssociation(agentId: string, fragmentId: string): Promise<Relationship> {
    const fragment = await this.readFragmentOrThrow(fragmentId);
    if (!AGENT_PARENT_KINDS.has(fragment.kind)) {
      throw new AppError(
        `${fragment.kind} fragments cannot be associated directly to an agent`,
        APP_ERROR_CODES.VALIDATION
      );
    }

    return this.relationshipManager.createRelationship({
      sourceEntityId: agentId,
      sourceEntityType: ENTITY_TYPE.AGENT,
      targetEntityId: fragmentId,
      targetEntityType: ENTITY_TYPE.FRAGMENT,
      relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
    });
  }

  /**
   * Remove an agent's association to a fragment (unshare).
   * @throws AppError with RELATIONSHIP_NOT_FOUND if no such association exists.
   */
  public async removeAssociation(agentId: string, fragmentId: string): Promise<void> {
    const associations = this.relationshipManager.queryRelationships({
      sourceEntityId: agentId,
      sourceEntityType: ENTITY_TYPE.AGENT,
      targetEntityId: fragmentId,
      targetEntityType: ENTITY_TYPE.FRAGMENT,
      relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
    });
    if (associations.length === 0) {
      throw new AppError(
        `No association between agent ${agentId} and fragment ${fragmentId}`,
        APP_ERROR_CODES.RELATIONSHIP_NOT_FOUND
      );
    }

    for (const association of associations) {
      await this.relationshipManager.deleteRelationship(association.id);
    }
  }

  /**
   * Link an existing fragment under a parent fragment, enforcing the parent
   * matrix and DAG acyclicity. The graph is a DAG, not a tree — any fragment
   * may carry multiple LINK parents; only cycles and kind mismatches are
   * rejected.
   */
  public async createLink(parentFragmentId: string, childFragmentId: string): Promise<Relationship> {
    const parentFragment = await this.readFragmentOrThrow(parentFragmentId);
    const childFragment = await this.readFragmentOrThrow(childFragmentId);

    this.assertFragmentParentKindAllowed(childFragment.kind, parentFragment.kind);

    // Adding parent → child closes a cycle iff the child can already reach the parent
    if (
      this.relationshipManager.canReach(childFragmentId, parentFragmentId, {
        relationshipType: RELATIONSHIP_TYPE.LINK,
      })
    ) {
      throw new AppError(
        `Linking fragment ${childFragmentId} under ${parentFragmentId} would create a cycle`,
        APP_ERROR_CODES.VALIDATION
      );
    }

    return this.relationshipManager.createRelationship({
      sourceEntityId: parentFragmentId,
      sourceEntityType: ENTITY_TYPE.FRAGMENT,
      targetEntityId: childFragmentId,
      targetEntityType: ENTITY_TYPE.FRAGMENT,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
  }

  /**
   * Remove a fragment → fragment LINK. A pure named-edge removal.
   * @throws AppError with RELATIONSHIP_NOT_FOUND if no such link exists.
   */
  public async removeLink(parentFragmentId: string, childFragmentId: string): Promise<void> {
    const links = this.relationshipManager.queryRelationships({
      sourceEntityId: parentFragmentId,
      sourceEntityType: ENTITY_TYPE.FRAGMENT,
      targetEntityId: childFragmentId,
      targetEntityType: ENTITY_TYPE.FRAGMENT,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    if (links.length === 0) {
      throw new AppError(
        `No link between fragments ${parentFragmentId} and ${childFragmentId}`,
        APP_ERROR_CODES.RELATIONSHIP_NOT_FOUND
      );
    }

    for (const link of links) {
      await this.relationshipManager.deleteRelationship(link.id);
    }
  }

  /**
   * Remove one named source → fragment edge (an agent ASSOCIATION or a
   * fragment LINK), then orphan-collect: a fragment with no remaining
   * incoming edge — no ASSOCIATION from any agent and no incoming LINK — is
   * unreachable, so it is deleted, cascading into every descendant that
   * thereby loses its last incoming edge. Descendants still reachable
   * another way survive; removing one path to a shared node just drops
   * that edge.
   * @returns ids of every fragment collected by the cascade, parents first.
   * @throws AppError with RELATIONSHIP_NOT_FOUND if the named edge does not exist.
   */
  public async unlinkFragment(source: FragmentParent, fragmentId: string): Promise<string[]> {
    if (source.entityType === ENTITY_TYPE.AGENT) {
      await this.removeAssociation(source.entityId, fragmentId);
    } else {
      await this.removeLink(source.entityId, fragmentId);
    }

    const collected: string[] = [];
    await this.collectIfOrphaned(fragmentId, collected);

    return collected;
  }

  /**
   * Resolve an agent's fragment scope: every fragment reachable from any of
   * its ASSOCIATION edges, following LINKs parent → child.
   */
  public getScopedFragmentIds(agentId: string): Set<string> {
    const scoped = new Set<string>();
    const queue = this.relationshipManager
      .queryRelationships({
        sourceEntityId: agentId,
        sourceEntityType: ENTITY_TYPE.AGENT,
        relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
      })
      .map((association) => association.targetEntityId);

    while (queue.length > 0) {
      const fragmentId = queue.pop();
      if (fragmentId === undefined || scoped.has(fragmentId)) {
        continue;
      }

      scoped.add(fragmentId);

      for (const link of this.relationshipManager.queryRelationships({
        sourceEntityId: fragmentId,
        sourceEntityType: ENTITY_TYPE.FRAGMENT,
        relationshipType: RELATIONSHIP_TYPE.LINK,
      })) {
        queue.push(link.targetEntityId);
      }
    }

    return scoped;
  }

  /**
   * Reverse reachability: which agents can reach a fragment, walking incoming
   * LINKs up to every ancestor and collecting their ASSOCIATION sources.
   */
  public getAgentsReachingFragment(fragmentId: string): string[] {
    const visitedFragmentIds = new Set<string>();
    const agentIds = new Set<string>();
    const queue = [fragmentId];

    while (queue.length > 0) {
      const currentId = queue.pop();
      if (currentId === undefined || visitedFragmentIds.has(currentId)) {
        continue;
      }

      visitedFragmentIds.add(currentId);

      for (const association of this.relationshipManager.queryRelationships({
        targetEntityId: currentId,
        targetEntityType: ENTITY_TYPE.FRAGMENT,
        relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
      })) {
        agentIds.add(association.sourceEntityId);
      }

      for (const link of this.relationshipManager.queryRelationships({
        targetEntityId: currentId,
        targetEntityType: ENTITY_TYPE.FRAGMENT,
        relationshipType: RELATIONSHIP_TYPE.LINK,
      })) {
        queue.push(link.sourceEntityId);
      }
    }

    return Array.from(agentIds);
  }

  /**
   * The one opaque accessibility rule (graph twin of circleManager.isAgentVisible):
   * walk up the fragment's incoming LINKs and return true the moment the fragment
   * itself or any ancestor carries an ASSOCIATION from the agent, short-circuiting
   * on the first hit. The reflection-curator allowance is encapsulated here — it
   * may reach any fragment, exactly like a user editing the graph.
   */
  public isFragmentAccessible(agentId: string, fragmentId: string): boolean {
    if (agentId === FRAGMENT_REFLECTION_AGENT_ID) {
      return true;
    }

    const visited = new Set<string>();
    const queue = [fragmentId];

    while (queue.length > 0) {
      const currentId = queue.pop();
      if (currentId === undefined || visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);

      const anchors = this.relationshipManager.queryRelationships({
        sourceEntityId: agentId,
        sourceEntityType: ENTITY_TYPE.AGENT,
        targetEntityId: currentId,
        targetEntityType: ENTITY_TYPE.FRAGMENT,
        relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
      });
      if (anchors.length > 0) {
        return true;
      }

      for (const link of this.getParentLinks(currentId)) {
        queue.push(link.sourceEntityId);
      }
    }

    return false;
  }

  /**
   * Resolve a fragment's domains through the graph: a DOMAIN resolves to
   * itself; anything else to the nearest DOMAIN on every upward LINK path —
   * the graph is a DAG, so there may be several. A branch stops at the first
   * DOMAIN it meets (never ascending past it); the result is deduplicated and
   * empty when there is no DOMAIN ancestry. Deterministic signal for the
   * active-domain runtime state; reads the hot cue index only.
   */
  public async resolveDomain(fragmentId: string): Promise<string[]> {
    const visited = new Set<string>();
    const domainIds = new Set<string>();
    const queue = [fragmentId];

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (currentId === undefined || visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);

      const entry = await this.indexStore.get<FragmentCueIndexEntry>(FRAGMENT_INDEX_STORE_TABLE, currentId);
      if (entry?.value.kind === FRAGMENT_KIND.DOMAIN) {
        domainIds.add(currentId);
        continue;
      }

      for (const link of this.getParentLinks(currentId)) {
        queue.push(link.sourceEntityId);
      }
    }

    return Array.from(domainIds);
  }

  /** Cue index entry for a single fragment (hot tier only) */
  public async getFragmentCue(fragmentId: string): Promise<FragmentCueIndexEntry | undefined> {
    const entry = await this.indexStore.get<FragmentCueIndexEntry>(FRAGMENT_INDEX_STORE_TABLE, fragmentId);

    return entry?.value;
  }

  /** Cue index entries of the fragments directly associated to an agent (first-order ASSOCIATION edges, hot tier only) */
  public async getFirstLevelFragmentCues(agentId: string): Promise<FragmentCueIndexEntry[]> {
    const fragmentIds = this.relationshipManager
      .queryRelationships({
        sourceEntityId: agentId,
        sourceEntityType: ENTITY_TYPE.AGENT,
        relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
      })
      .map((association) => association.targetEntityId);

    const entries = await this.indexStore.getMany<FragmentCueIndexEntry>(FRAGMENT_INDEX_STORE_TABLE, fragmentIds);

    return fragmentIds.flatMap((fragmentId) => {
      const entry = entries.get(fragmentId);

      return entry ? [entry.value] : [];
    });
  }

  /** Cue index entries of a fragment's direct LINK children (hot tier only) */
  public async getChildFragmentCues(fragmentId: string): Promise<FragmentCueIndexEntry[]> {
    const childIds = this.relationshipManager
      .queryRelationships({
        sourceEntityId: fragmentId,
        sourceEntityType: ENTITY_TYPE.FRAGMENT,
        relationshipType: RELATIONSHIP_TYPE.LINK,
      })
      .map((link) => link.targetEntityId);

    const entries = await this.indexStore.getMany<FragmentCueIndexEntry>(FRAGMENT_INDEX_STORE_TABLE, childIds);

    return childIds.flatMap((childId) => {
      const entry = entries.get(childId);

      return entry ? [entry.value] : [];
    });
  }

  /** Cue index entries of a fragment's direct LINK parents (hot tier only) */
  public async getParentFragmentCues(fragmentId: string): Promise<FragmentCueIndexEntry[]> {
    const parentIds = this.getParentLinks(fragmentId).map((link) => link.sourceEntityId);

    const entries = await this.indexStore.getMany<FragmentCueIndexEntry>(FRAGMENT_INDEX_STORE_TABLE, parentIds);

    return parentIds.flatMap((parentId) => {
      const entry = entries.get(parentId);

      return entry ? [entry.value] : [];
    });
  }

  /** All fragments from the source-of-truth store, skipping invalid entries */
  public async getAllFragments(): Promise<Fragment[]> {
    const entries = await this.fragmentStore.getAll<Fragment>(FRAGMENT_STORE_TABLE);

    const fragments: Fragment[] = [];
    for (const entry of entries) {
      const result = FragmentSchema.safeParse(entry.value);
      if (result.success) {
        fragments.push(result.data);
      } else {
        log.warn({ issues: result.error.issues }, "Skipping invalid fragment in fragment store");
      }
    }

    return fragments;
  }

  /** Rebuild the derived cue index from the fragment store */
  public async rebuildIndex(): Promise<void> {
    const fragments = await this.getAllFragments();
    const indexEntries: Array<readonly [string, FragmentCueIndexEntry]> = fragments.map((fragment) => [
      fragment.id,
      this.toIndexEntry(fragment),
    ]);

    await this.indexStore.clear(FRAGMENT_INDEX_STORE_TABLE);
    if (indexEntries.length > 0) {
      await this.indexStore.setMany(FRAGMENT_INDEX_STORE_TABLE, indexEntries);
    }

    log.info({ fragments: indexEntries.length }, "Fragment cue index rebuilt");
  }

  private assertBodyWithinWordCap(body: string): void {
    const wordCount = countWords(body);
    if (wordCount > FRAGMENT_MAX_WORDS) {
      throw new AppError(
        `Fragment body exceeds ${FRAGMENT_MAX_WORDS} words (got ${wordCount})`,
        APP_ERROR_CODES.VALIDATION
      );
    }
  }

  private assertFragmentParentKindAllowed(childKind: FragmentKind, parentKind: FragmentKind): void {
    if (!FRAGMENT_PARENT_KINDS[childKind].has(parentKind)) {
      throw new AppError(
        `${childKind} fragments cannot be linked under a ${parentKind} fragment`,
        APP_ERROR_CODES.VALIDATION
      );
    }
  }

  private assertNoUpdateConflict(existing: Fragment, expectedUpdatedTimestamp?: number): void {
    if (expectedUpdatedTimestamp !== undefined && existing.updatedTimestamp !== expectedUpdatedTimestamp) {
      throw new AppError(
        "Fragment was modified since it was read. Re-read the fragment and retry.",
        APP_ERROR_CODES.CONFLICT
      );
    }
  }

  /** Validate a create parent before anything is written */
  private async validateParent(kind: FragmentKind, parent: FragmentParent): Promise<void> {
    if (parent.entityType === ENTITY_TYPE.AGENT) {
      if (!AGENT_PARENT_KINDS.has(kind)) {
        throw new AppError(`${kind} fragments cannot be associated directly to an agent`, APP_ERROR_CODES.VALIDATION);
      }

      return;
    }

    const parentFragment = await this.readFragmentOrThrow(parent.entityId);
    this.assertFragmentParentKindAllowed(kind, parentFragment.kind);
  }

  /** Create the parent edge for a freshly created fragment */
  private async createParentEdge(fragmentId: string, parent: FragmentParent): Promise<Relationship> {
    if (parent.entityType === ENTITY_TYPE.AGENT) {
      return this.createAssociation(parent.entityId, fragmentId);
    }

    return this.createLink(parent.entityId, fragmentId);
  }

  /** Delete a fragment unconditionally: strip its remaining edges, clear both tiers, emit */
  private async purgeFragment(fragmentId: string): Promise<void> {
    await this.relationshipManager.removeRelationshipsForEntity(fragmentId);
    await this.fragmentStore.delete(FRAGMENT_STORE_TABLE, fragmentId);
    await this.indexStore.delete(FRAGMENT_INDEX_STORE_TABLE, fragmentId);

    log.info({ fragmentId }, "Fragment deleted");
    this.emit("fragmentDeleted", { fragmentId });
  }

  /** Cascade-GC: purge a fragment with no incoming edge left, then re-check its former children */
  private async collectIfOrphaned(fragmentId: string, collected: string[]): Promise<void> {
    if (this.hasIncomingEdge(fragmentId)) {
      return;
    }

    // Children must be gathered before the purge severs the outgoing LINKs
    const childIds = this.relationshipManager
      .queryRelationships({
        sourceEntityId: fragmentId,
        sourceEntityType: ENTITY_TYPE.FRAGMENT,
        relationshipType: RELATIONSHIP_TYPE.LINK,
      })
      .map((link) => link.targetEntityId);

    await this.purgeFragment(fragmentId);
    collected.push(fragmentId);

    for (const childId of childIds) {
      await this.collectIfOrphaned(childId, collected);
    }
  }

  private hasIncomingEdge(fragmentId: string): boolean {
    if (this.getParentLinks(fragmentId).length > 0) {
      return true;
    }

    const associations = this.relationshipManager.queryRelationships({
      targetEntityId: fragmentId,
      targetEntityType: ENTITY_TYPE.FRAGMENT,
      relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
    });

    return associations.length > 0;
  }

  private getParentLinks(fragmentId: string): Relationship[] {
    return this.relationshipManager.queryRelationships({
      targetEntityId: fragmentId,
      targetEntityType: ENTITY_TYPE.FRAGMENT,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
  }

  private toIndexEntry(fragment: Fragment): FragmentCueIndexEntry {
    return {
      id: fragment.id,
      kind: fragment.kind,
      cue: fragment.cue,
      createdTimestamp: fragment.createdTimestamp,
    };
  }

  private async readFragmentOrThrow(fragmentId: string): Promise<Fragment> {
    const entry = await this.fragmentStore.get<Fragment>(FRAGMENT_STORE_TABLE, fragmentId);
    if (!entry) {
      throw new AppError(`Fragment not found: ${fragmentId}`, APP_ERROR_CODES.FRAGMENT_NOT_FOUND);
    }

    const result = FragmentSchema.safeParse(entry.value);
    if (!result.success) {
      log.error({ fragmentId, issues: result.error.issues }, "Corrupted fragment data in store");
      throw new AppError(`Corrupted fragment data: ${fragmentId}`, APP_ERROR_CODES.UNKNOWN);
    }

    return result.data;
  }
}
