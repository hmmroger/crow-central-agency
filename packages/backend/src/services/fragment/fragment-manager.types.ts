import type { ENTITY_TYPE, Fragment, FragmentKind } from "@crow-central-agency/shared";
import type { EventMap } from "../../core/event-bus/event-bus.types.js";

/** The source node a new fragment hangs off: an agent (ASSOCIATION) or a fragment (LINK) */
export interface FragmentParent {
  entityType: typeof ENTITY_TYPE.AGENT | typeof ENTITY_TYPE.FRAGMENT;
  entityId: string;
}

/**
 * Fragment lifecycle events emitted by the FragmentManager, consumed by the
 * search index to keep fragment documents in sync. WS graph broadcasts are
 * emitted inline via the injected broadcaster, not through these events.
 */
export interface FragmentManagerEvents extends EventMap {
  fragmentCreated: { fragment: Fragment };
  fragmentUpdated: { fragment: Fragment };
  fragmentDeleted: { fragmentId: string };
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
