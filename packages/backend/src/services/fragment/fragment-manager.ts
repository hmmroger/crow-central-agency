import {
  ENTITY_TYPE,
  FRAGMENT_KIND,
  FRAGMENT_MAX_WORDS,
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
 * RelationshipManager): parent rules, word cap, acyclicity, and agent scope
 * (reachability) are all enforced here at write time.
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
   * Delete a fragment from both tiers, cascading its remaining graph edges
   * so no dangling ASSOCIATION/LINK survives it.
   * @throws AppError with FRAGMENT_NOT_FOUND if the fragment does not exist.
   */
  public async deleteFragment(fragmentId: string): Promise<void> {
    await this.readFragmentOrThrow(fragmentId);

    await this.relationshipManager.removeRelationshipsForEntity(fragmentId);
    await this.fragmentStore.delete(FRAGMENT_STORE_TABLE, fragmentId);
    await this.indexStore.delete(FRAGMENT_INDEX_STORE_TABLE, fragmentId);

    log.info({ fragmentId }, "Fragment deleted");
    this.emit("fragmentDeleted", { fragmentId });
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
   * Associate an agent to a fragment (sharing). Agent id validity is the
   * caller's responsibility; fragment existence is validated here.
   * @throws AppError with DUPLICATE_RELATIONSHIP if the association already exists.
   */
  public async createAssociation(agentId: string, fragmentId: string): Promise<Relationship> {
    await this.readFragmentOrThrow(fragmentId);

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
   * matrix, KNOWLEDGE single-parent, and DAG acyclicity.
   */
  public async createLink(parentFragmentId: string, childFragmentId: string): Promise<Relationship> {
    const parentFragment = await this.readFragmentOrThrow(parentFragmentId);
    const childFragment = await this.readFragmentOrThrow(childFragmentId);

    this.assertFragmentParentKindAllowed(childFragment.kind, parentFragment.kind);

    if (childFragment.kind === FRAGMENT_KIND.KNOWLEDGE && this.getParentLinks(childFragmentId).length > 0) {
      throw new AppError(
        `${FRAGMENT_KIND.KNOWLEDGE} fragment ${childFragmentId} already has a parent`,
        APP_ERROR_CODES.VALIDATION
      );
    }

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
   * Remove a fragment → fragment LINK. Rejected for a KNOWLEDGE child: it must
   * always keep its single DOMAIN parent, so its link can only move (re-link),
   * never be removed.
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

    const childFragment = await this.readFragmentOrThrow(childFragmentId);
    if (childFragment.kind === FRAGMENT_KIND.KNOWLEDGE) {
      throw new AppError(
        `Cannot unlink a ${FRAGMENT_KIND.KNOWLEDGE} fragment from its parent`,
        APP_ERROR_CODES.VALIDATION
      );
    }

    for (const link of links) {
      await this.relationshipManager.deleteRelationship(link.id);
    }
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
   * Agent-facing read: only fragments within the acting agent's resolved scope.
   * Out-of-scope access reports FRAGMENT_NOT_FOUND so existence never leaks.
   */
  public async readFragmentForAgent(actingAgentId: string, fragmentId: string): Promise<Fragment> {
    this.assertFragmentInAgentScope(actingAgentId, fragmentId);

    return this.readFragment(fragmentId);
  }

  /** Agent-facing update: same scope rule as readFragmentForAgent */
  public async updateFragmentForAgent(
    actingAgentId: string,
    fragmentId: string,
    input: UpdateFragmentInput
  ): Promise<Fragment> {
    this.assertFragmentInAgentScope(actingAgentId, fragmentId);

    return this.updateFragment(fragmentId, input);
  }

  /**
   * Agent-facing create: an agent parent must be the acting agent itself and a
   * fragment parent must be within the acting agent's scope.
   */
  public async createFragmentForAgent(actingAgentId: string, input: CreateFragmentInput): Promise<Fragment> {
    this.assertParentWithinAgentAuthority(actingAgentId, input.parent);

    return this.createFragment(input);
  }

  /**
   * Re-link a fragment under a new parent: replaces its incoming LINKs plus
   * the acting agent's own ASSOCIATION anchor (if present) with the single new
   * parent edge; other agents' sharing ASSOCIATIONs are untouched. Structural
   * move only — updatedTimestamp is not bumped.
   */
  public async relinkFragment(
    actingAgentId: string,
    fragmentId: string,
    newParent: FragmentParent,
    expectedUpdatedTimestamp?: number
  ): Promise<Relationship> {
    this.assertFragmentInAgentScope(actingAgentId, fragmentId);
    const fragment = await this.readFragmentOrThrow(fragmentId);
    this.assertNoUpdateConflict(fragment, expectedUpdatedTimestamp);
    this.assertParentWithinAgentAuthority(actingAgentId, newParent);
    await this.validateParent(fragment.kind, newParent);

    // Cycle check must run before the old parent edges are removed — a failed
    // re-link must leave the fragment exactly as it was
    if (
      newParent.entityType === ENTITY_TYPE.FRAGMENT &&
      this.relationshipManager.canReach(fragmentId, newParent.entityId, {
        relationshipType: RELATIONSHIP_TYPE.LINK,
      })
    ) {
      throw new AppError(
        `Re-linking fragment ${fragmentId} under ${newParent.entityId} would create a cycle`,
        APP_ERROR_CODES.VALIDATION
      );
    }

    const parentEdges = [
      ...this.getParentLinks(fragmentId),
      ...this.relationshipManager.queryRelationships({
        sourceEntityId: actingAgentId,
        sourceEntityType: ENTITY_TYPE.AGENT,
        targetEntityId: fragmentId,
        targetEntityType: ENTITY_TYPE.FRAGMENT,
        relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
      }),
    ];
    for (const edge of parentEdges) {
      await this.relationshipManager.deleteRelationship(edge.id);
    }

    return this.createParentEdge(fragmentId, newParent);
  }

  /**
   * Agent-facing delete. Rejected while the fragment has children (outgoing
   * LINKs) or any other agent can still reach it — a shared node is unshared
   * via the sharing route, never destroyed out from under other agents.
   */
  public async deleteFragmentForAgent(actingAgentId: string, fragmentId: string): Promise<void> {
    this.assertFragmentInAgentScope(actingAgentId, fragmentId);

    const childLinks = this.relationshipManager.queryRelationships({
      sourceEntityId: fragmentId,
      sourceEntityType: ENTITY_TYPE.FRAGMENT,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    if (childLinks.length > 0) {
      throw new AppError(
        `Fragment ${fragmentId} has ${childLinks.length} child fragment(s). Re-parent or delete them first`,
        APP_ERROR_CODES.VALIDATION
      );
    }

    const otherReachers = this.getAgentsReachingFragment(fragmentId).filter((agentId) => agentId !== actingAgentId);
    if (otherReachers.length > 0) {
      throw new AppError(
        `Fragment ${fragmentId} is still reachable by other agents. Remove your association instead of deleting it`,
        APP_ERROR_CODES.VALIDATION
      );
    }

    await this.deleteFragment(fragmentId);
  }

  /**
   * Resolve a fragment's domain through the graph: a DOMAIN resolves to
   * itself, anything else to the nearest DOMAIN in its LINK ancestry, or
   * undefined when there is none. Deterministic signal for the active-domain
   * runtime state; reads the hot cue index only.
   */
  public async resolveDomain(fragmentId: string): Promise<string | undefined> {
    const visited = new Set<string>();
    const queue = [fragmentId];

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (currentId === undefined || visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);

      const entry = await this.indexStore.get<FragmentCueIndexEntry>(FRAGMENT_INDEX_STORE_TABLE, currentId);
      if (entry?.value.kind === FRAGMENT_KIND.DOMAIN) {
        return currentId;
      }

      for (const link of this.getParentLinks(currentId)) {
        queue.push(link.sourceEntityId);
      }
    }

    return undefined;
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

  /** Rebuild the derived cue index from the fragment store */
  public async rebuildIndex(): Promise<void> {
    const entries = await this.fragmentStore.getAll<Fragment>(FRAGMENT_STORE_TABLE);

    const indexEntries: Array<readonly [string, FragmentCueIndexEntry]> = [];
    for (const entry of entries) {
      const result = FragmentSchema.safeParse(entry.value);
      if (result.success) {
        indexEntries.push([result.data.id, this.toIndexEntry(result.data)]);
      } else {
        log.warn({ issues: result.error.issues }, "Skipping invalid fragment in fragment store");
      }
    }

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

  private assertFragmentInAgentScope(actingAgentId: string, fragmentId: string): void {
    if (!this.getScopedFragmentIds(actingAgentId).has(fragmentId)) {
      throw new AppError(`Fragment not found: ${fragmentId}`, APP_ERROR_CODES.FRAGMENT_NOT_FOUND);
    }
  }

  private assertParentWithinAgentAuthority(actingAgentId: string, parent: FragmentParent): void {
    if (parent.entityType === ENTITY_TYPE.AGENT) {
      if (parent.entityId !== actingAgentId) {
        throw new AppError("An agent can only anchor a fragment to itself", APP_ERROR_CODES.VALIDATION);
      }

      return;
    }

    this.assertFragmentInAgentScope(actingAgentId, parent.entityId);
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
