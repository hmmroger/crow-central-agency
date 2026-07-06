import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedSearchIndex, SEARCH_INDEX_KEY, SEARCH_INDEX_STORE_TABLE } from "./feed-search-index.js";
import type { PersistedSearchIndex } from "./feed-search-index.types.js";
import type { FeedItem } from "./simply-feed.types.js";
import { FeedItemTypes } from "./simply-feed.types.js";
import { InMemoryObjectStore } from "../core/store/in-memory-object-store.mock.js";

const FEED_A = "feed-a";
const FEED_B = "feed-b";

let itemCounter = 0;

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  itemCounter += 1;

  return {
    id: `item-${itemCounter}`,
    feedId: FEED_A,
    feedItemType: FeedItemTypes.Post,
    title: "",
    subtitle: "",
    description: "",
    content: "",
    link: `https://example.com/${itemCounter}`,
    publishedTime: itemCounter,
    lastUpdateTime: itemCounter,
    ...overrides,
  };
}

async function readPersisted(store: InMemoryObjectStore): Promise<PersistedSearchIndex | undefined> {
  const entry = await store.get<PersistedSearchIndex>(SEARCH_INDEX_STORE_TABLE, SEARCH_INDEX_KEY);

  return entry?.value;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("FeedSearchIndex indexing and mapping", () => {
  it("indexes each searchable field", () => {
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);

    index.addOrReplace([
      makeItem({ id: "by-title", title: "quantumfield discovery" }),
      makeItem({ id: "by-subtitle", subtitle: "quantumfield sidebar" }),
      makeItem({ id: "by-description", description: "quantumfield explained" }),
      makeItem({ id: "by-summary", summary: "quantumfield summarized" }),
      makeItem({ id: "by-topics", topics: ["quantumfield"] }),
      makeItem({ id: "by-categories", categories: ["quantumfield"] }),
      makeItem({ id: "by-author", author: "quantumfield" }),
    ]);

    const found = new Set(index.search("quantumfield", []).map((result) => result.id));

    expect(found).toEqual(
      new Set(["by-title", "by-subtitle", "by-description", "by-summary", "by-topics", "by-categories", "by-author"])
    );
  });

  it("does not index raw content", () => {
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);

    index.addOrReplace([makeItem({ id: "content-only", title: "unrelated", content: "zygote uniqueterm body" })]);

    expect(index.search("zygote", [])).toHaveLength(0);
  });

  it("tolerates items missing optional fields", () => {
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);

    index.addOrReplace([makeItem({ id: "minimal", title: "sparsely populated" })]);

    expect(index.search("sparsely", []).map((result) => result.id)).toEqual(["minimal"]);
  });
});

describe("FeedSearchIndex ranking", () => {
  it("ranks title matches above body matches via boost", () => {
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);

    index.addOrReplace([
      makeItem({ id: "in-body", description: "photosynthesis is a process" }),
      makeItem({ id: "in-title", title: "photosynthesis" }),
    ]);

    const ranked = index.search("photosynthesis", []).map((result) => result.id);

    expect(ranked[0]).toBe("in-title");
    expect(ranked).toContain("in-body");
  });

  it("supports prefix matching", () => {
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);

    index.addOrReplace([makeItem({ id: "prefix", title: "astronomical event" })]);

    expect(index.search("astro", []).map((result) => result.id)).toContain("prefix");
  });

  it("tolerates typos via fuzzy matching", () => {
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);

    index.addOrReplace([makeItem({ id: "fuzzy", title: "kubernetes" })]);

    expect(index.search("kubernetel", []).map((result) => result.id)).toContain("fuzzy");
  });
});

describe("FeedSearchIndex expansion terms", () => {
  it("adds recall without displacing a raw match", () => {
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);

    index.addOrReplace([
      makeItem({ id: "raw-hit", title: "electric vehicles" }),
      makeItem({ id: "expansion-hit", topics: ["battery"] }),
    ]);

    const withoutExpansion = index.search("electric vehicles", []).map((result) => result.id);
    expect(withoutExpansion).toEqual(["raw-hit"]);

    const withExpansion = index.search("electric vehicles", ["battery"]);
    const ids = withExpansion.map((result) => result.id);
    expect(ids).toContain("raw-hit");
    expect(ids).toContain("expansion-hit");
    expect(ids[0]).toBe("raw-hit");

    const rawScore = withExpansion.find((result) => result.id === "raw-hit")?.score ?? 0;
    const expansionScore = withExpansion.find((result) => result.id === "expansion-hit")?.score ?? 0;
    expect(rawScore).toBeGreaterThan(expansionScore);
  });

  it("boosts an item that matches both raw and expansion terms", () => {
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);

    index.addOrReplace([makeItem({ id: "both", title: "climate policy", topics: ["emissions"] })]);

    const rawOnly = index.search("climate policy", []).find((result) => result.id === "both")?.score ?? 0;
    const blended = index.search("climate policy", ["emissions"]).find((result) => result.id === "both")?.score ?? 0;

    expect(blended).toBeGreaterThan(rawOnly);
  });
});

describe("FeedSearchIndex feed filtering", () => {
  it("restricts results to the requested feeds", () => {
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);

    index.addOrReplace([
      makeItem({ id: "a-hit", feedId: FEED_A, title: "shared topic" }),
      makeItem({ id: "b-hit", feedId: FEED_B, title: "shared topic" }),
    ]);

    const ids = index.search("shared topic", [], [FEED_A]).map((result) => result.id);

    expect(ids).toEqual(["a-hit"]);
  });

  it("returns all feeds when feedIds is undefined", () => {
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);

    index.addOrReplace([
      makeItem({ id: "a-hit", feedId: FEED_A, title: "shared topic" }),
      makeItem({ id: "b-hit", feedId: FEED_B, title: "shared topic" }),
    ]);

    const ids = new Set(index.search("shared topic", []).map((result) => result.id));

    expect(ids).toEqual(new Set(["a-hit", "b-hit"]));
  });

  it("returns no results for an empty feedIds list", () => {
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);

    index.addOrReplace([makeItem({ id: "a-hit", feedId: FEED_A, title: "shared topic" })]);

    expect(index.search("shared topic", [], [])).toHaveLength(0);
  });
});

describe("FeedSearchIndex mutation", () => {
  it("replaces an existing item rather than duplicating it", () => {
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);

    index.addOrReplace([makeItem({ id: "mutable", title: "alpha" })]);
    index.addOrReplace([makeItem({ id: "mutable", title: "beta" })]);

    expect(index.search("alpha", [])).toHaveLength(0);
    expect(index.search("beta", []).map((result) => result.id)).toEqual(["mutable"]);
  });

  it("discards items by id", () => {
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);

    index.addOrReplace([makeItem({ id: "keep", title: "shared" }), makeItem({ id: "drop", title: "shared" })]);
    index.discard(["drop"]);

    expect(index.search("shared", []).map((result) => result.id)).toEqual(["keep"]);
  });

  it("ignores discard of absent ids without throwing", () => {
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);

    index.addOrReplace([makeItem({ id: "present", title: "shared" })]);

    expect(() => index.discard(["never-added"])).not.toThrow();
    expect(index.search("shared", []).map((result) => result.id)).toEqual(["present"]);
  });

  it("treats an empty addOrReplace as a no-op", async () => {
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);

    index.addOrReplace([]);
    await index.flush();

    expect(await readPersisted(store)).toBeUndefined();
  });
});

describe("FeedSearchIndex persistence", () => {
  it("does not persist synchronously on mutation but flushes on demand", async () => {
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);

    index.addOrReplace([makeItem({ id: "pending", title: "deferred write" })]);
    expect(await readPersisted(store)).toBeUndefined();

    await index.flush();

    const persisted = await readPersisted(store);
    expect(persisted?.serializedIndex).toBeTruthy();
    expect(persisted?.optionsFingerprint).toBeTruthy();
  });

  it("persists after the debounce window elapses", async () => {
    vi.useFakeTimers();
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);

    index.addOrReplace([makeItem({ id: "debounced", title: "eventual write" })]);
    expect(await readPersisted(store)).toBeUndefined();

    await vi.runAllTimersAsync();

    expect(await readPersisted(store)).toBeDefined();
  });

  it("re-marks the index dirty when the store write fails", async () => {
    const store = new InMemoryObjectStore();
    const failure = new Error("store offline");
    const setSpy = vi.spyOn(store, "set").mockRejectedValueOnce(failure);
    const index = new FeedSearchIndex(store);

    index.addOrReplace([makeItem({ id: "retry", title: "will retry" })]);
    await index.flush();
    expect(setSpy).toHaveBeenCalledTimes(1);

    setSpy.mockRestore();
    await index.flush();

    expect(await readPersisted(store)).toBeDefined();
  });
});

describe("FeedSearchIndex initialization", () => {
  it("rebuilds from the loader when no index is persisted", async () => {
    const store = new InMemoryObjectStore();
    const index = new FeedSearchIndex(store);
    const loader = vi.fn(async () => [makeItem({ id: "rebuilt", title: "loaded item" })]);

    await index.initialize(loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(index.search("loaded", []).map((result) => result.id)).toEqual(["rebuilt"]);
    expect(await readPersisted(store)).toBeDefined();
  });

  it("loads a persisted index without rebuilding when the fingerprint matches", async () => {
    const store = new InMemoryObjectStore();
    const seed = new FeedSearchIndex(store);
    seed.addOrReplace([makeItem({ id: "persisted", title: "carried over" })]);
    await seed.flush();

    const index = new FeedSearchIndex(store);
    const loader = vi.fn(async () => []);
    await index.initialize(loader);

    expect(loader).not.toHaveBeenCalled();
    expect(index.search("carried", []).map((result) => result.id)).toEqual(["persisted"]);
  });

  it("discards and rebuilds when the persisted fingerprint no longer matches", async () => {
    const store = new InMemoryObjectStore();
    await store.set<PersistedSearchIndex>(SEARCH_INDEX_STORE_TABLE, SEARCH_INDEX_KEY, {
      optionsFingerprint: "stale-fingerprint",
      serializedIndex: "{}",
    });

    const index = new FeedSearchIndex(store);
    const loader = vi.fn(async () => [makeItem({ id: "fresh", title: "rebuilt payload" })]);
    await index.initialize(loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(index.search("rebuilt", []).map((result) => result.id)).toEqual(["fresh"]);
  });

  it("rebuilds when the persisted serialized index is corrupt", async () => {
    const store = new InMemoryObjectStore();
    const seed = new FeedSearchIndex(store);
    seed.addOrReplace([makeItem({ id: "throwaway", title: "unused" })]);
    await seed.flush();
    const validFingerprint = (await readPersisted(store))?.optionsFingerprint ?? "";

    await store.set<PersistedSearchIndex>(SEARCH_INDEX_STORE_TABLE, SEARCH_INDEX_KEY, {
      optionsFingerprint: validFingerprint,
      serializedIndex: "definitely not json {",
    });

    const index = new FeedSearchIndex(store);
    const loader = vi.fn(async () => [makeItem({ id: "recovered", title: "recovered item" })]);
    await index.initialize(loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(index.search("recovered", []).map((result) => result.id)).toEqual(["recovered"]);
  });

  it("round-trips search results across a persist and reload", async () => {
    const store = new InMemoryObjectStore();
    const items = [
      makeItem({ id: "one", feedId: FEED_A, title: "renewable energy", topics: ["solar"] }),
      makeItem({ id: "two", feedId: FEED_B, title: "renewable grid", author: "grid analyst" }),
    ];

    const original = new FeedSearchIndex(store);
    original.addOrReplace(items);
    await original.flush();

    const reloaded = new FeedSearchIndex(store);
    await reloaded.initialize(async () => []);

    const query = "renewable";
    expect(reloaded.search(query, []).map((result) => result.id)).toEqual(
      original.search(query, []).map((result) => result.id)
    );
  });
});
