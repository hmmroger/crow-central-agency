import type { ObjectStoreProvider } from "../../core/store/object-store.types.js";

/** Per-agent reflection sweep state persisted between routine ticks */
export interface FragmentReflectionState {
  lastReflectionSweepTimestamp: number;
  failureCount: number;
}

/** Object store table holding per-agent fragment reflection sweep state */
export const FRAGMENT_REFLECTION_STATE_STORE_TABLE = "fragment-reflection-state";

const DEFAULT_REFLECTION_STATE: FragmentReflectionState = {
  lastReflectionSweepTimestamp: 0,
  failureCount: 0,
};

/** Persists per-agent reflection sweep state. */
export class FragmentReflectionStateStore {
  constructor(private readonly store: ObjectStoreProvider) {}

  public async getState(agentId: string): Promise<FragmentReflectionState> {
    const entry = await this.store.get<FragmentReflectionState>(FRAGMENT_REFLECTION_STATE_STORE_TABLE, agentId);

    return entry?.value ?? { ...DEFAULT_REFLECTION_STATE };
  }

  public async setState(agentId: string, state: FragmentReflectionState): Promise<void> {
    await this.store.set<FragmentReflectionState>(FRAGMENT_REFLECTION_STATE_STORE_TABLE, agentId, state);
  }
}
