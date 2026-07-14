import type { ObjectStoreProvider } from "../../core/store/object-store.types.js";

/** Per-agent reflection sweep state persisted between routine ticks */
interface FragmentReflectionState {
  lastReflectionSweepTimestamp: number;
}

/** Object store table holding per-agent fragment reflection sweep state */
export const FRAGMENT_REFLECTION_STATE_STORE_TABLE = "fragment-reflection-state";

/**
 * Persists the per-agent reflection sweep watermark: fragments created after it
 * are the "new set" the next reflection run reorganizes. Only a successfully
 * completed run advances it, so a failed run is retried on the next tick.
 */
export class FragmentReflectionStateStore {
  constructor(private readonly store: ObjectStoreProvider) {}

  public async getLastSweepTimestamp(agentId: string): Promise<number | undefined> {
    const entry = await this.store.get<FragmentReflectionState>(FRAGMENT_REFLECTION_STATE_STORE_TABLE, agentId);

    return entry?.value.lastReflectionSweepTimestamp;
  }

  public async setLastSweepTimestamp(agentId: string, timestamp: number): Promise<void> {
    await this.store.set<FragmentReflectionState>(FRAGMENT_REFLECTION_STATE_STORE_TABLE, agentId, {
      lastReflectionSweepTimestamp: timestamp,
    });
  }
}
