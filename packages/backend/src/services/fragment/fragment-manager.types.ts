import type { ENTITY_TYPE, Fragment, FragmentKind, Relationship } from "@crow-central-agency/shared";
import type { EventMap } from "../../core/event-bus/event-bus.types.js";

/** The source node a new fragment hangs off: an agent (ASSOCIATION) or a fragment (LINK) */
export interface FragmentParent {
  entityType: typeof ENTITY_TYPE.AGENT | typeof ENTITY_TYPE.FRAGMENT;
  entityId: string;
}

/**
 * Events emitted by the FragmentManager.
 * Relationship events fire for named ASSOCIATION/LINK edge writes; purge-time
 * edge strips are covered by the accompanying fragmentDeleted.
 */
export interface FragmentManagerEvents extends EventMap {
  fragmentCreated: { fragment: Fragment };
  fragmentUpdated: { fragment: Fragment };
  fragmentDeleted: { fragmentId: string };
  relationshipCreated: { relationship: Relationship };
  relationshipDeleted: { relationshipId: string };
}

/** Hot-tier cue index entry — derived from the fragment store, never authoritative */
export interface FragmentCueIndexEntry {
  id: string;
  kind: FragmentKind;
  cue: string;
  createdTimestamp: number;
}

export interface CreateFragmentInput {
  kind: FragmentKind;
  cue: string;
  body: string;
  parent: FragmentParent;
}

export interface UpdateFragmentInput {
  cue?: string;
  body?: string;
  /** Optimistic concurrency: reject if the fragment changed since this updatedTimestamp was read */
  expectedUpdatedTimestamp?: number;
}
