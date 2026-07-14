import { FragmentSchema, type Fragment } from "@crow-central-agency/shared";
import { EventBus } from "../../core/event-bus/event-bus.js";
import type { ObjectStoreProvider } from "../../core/store/object-store.types.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import { generateId } from "../../utils/id-utils.js";
import { logger } from "../../utils/logger.js";
import type {
  CreateFragmentInput,
  FragmentCueIndexEntry,
  FragmentManagerEvents,
  UpdateFragmentInput,
} from "./fragment-manager.types.js";

const log = logger.child({ context: "fragment-manager" });

/** Folder store table holding full fragment objects (source of truth) */
export const FRAGMENT_STORE_TABLE = "fragments";

/** Object store table holding the derived hot-tier cue index */
export const FRAGMENT_INDEX_STORE_TABLE = "fragments-index";

/**
 * Manages fragment persistence across two storage tiers:
 * - fragments (folder store, cold): full fragment incl. body + usage stats.
 * - fragments-index (object store, hot): {id, kind, cue, createdTimestamp} per fragment.
 * Create/update/delete write through to both tiers; body-only and usage-stat
 * writes skip the index since it holds neither.
 */
export class FragmentManager extends EventBus<FragmentManagerEvents> {
  constructor(
    private readonly fragmentStore: ObjectStoreProvider,
    private readonly indexStore: ObjectStoreProvider
  ) {
    super();
  }

  /** Rebuild the cue index from the fragment store so startup never carries drift */
  public async initialize(): Promise<void> {
    await this.rebuildIndex();
  }

  /** Create a fragment and write through to both tiers */
  public async createFragment(input: CreateFragmentInput): Promise<Fragment> {
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
    const existing = await this.readFragmentOrThrow(fragmentId);

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
   * Delete a fragment from both tiers.
   * @throws AppError with FRAGMENT_NOT_FOUND if the fragment does not exist.
   */
  public async deleteFragment(fragmentId: string): Promise<void> {
    await this.readFragmentOrThrow(fragmentId);

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
      throw new AppError(`Invalid fragment data: ${fragmentId}`, APP_ERROR_CODES.VALIDATION);
    }

    return result.data;
  }
}
