import { AgentBuilderDraftSchema, type AgentBuilderDraft } from "@crow-central-agency/shared";
import type { ObjectStoreProvider } from "../../core/store/object-store.types.js";

/** Object store table holding the single active World Builder draft. */
export const WORLD_BUILDER_DRAFT_STORE_TABLE = "world-builder-draft";

/** Fixed record key — only one active draft exists at a time. */
export const DRAFT_KEY = "active";

/**
 * Persists the single active World Builder draft fleet via the object store so it survives restart.
 * The frontend never sends the agents back; it only supplies new input that this store overlays.
 */
export class WorldBuilderDraftStore {
  constructor(private readonly store: ObjectStoreProvider) {}

  public async getDraft(): Promise<AgentBuilderDraft | undefined> {
    const entry = await this.store.get<AgentBuilderDraft>(WORLD_BUILDER_DRAFT_STORE_TABLE, DRAFT_KEY);
    return entry?.value;
  }

  public async saveDraft(draft: AgentBuilderDraft): Promise<AgentBuilderDraft> {
    const validated = AgentBuilderDraftSchema.parse(draft);
    const entry = await this.store.set(WORLD_BUILDER_DRAFT_STORE_TABLE, DRAFT_KEY, validated);
    return entry.value;
  }

  public async clearDraft(): Promise<void> {
    await this.store.delete(WORLD_BUILDER_DRAFT_STORE_TABLE, DRAFT_KEY);
  }
}
