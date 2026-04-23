import { z } from "zod";
import type { Feed, FeedIndexItem, FeedItem } from "./simply-feed.types.js";
import { discoverFeedCandidates, fetchItemsAndUpdateFeed } from "./feed-reader.js";
import { QUERY_USER_PROMPT, SUMMARY_SYSTEM_PROMPT, SUMMARY_USER_PROMPT } from "./system-prompts.js";
import { logger } from "../utils/logger.js";
import { STORE_QUERY_OPERATORS, type ObjectStoreProvider } from "../core/store/object-store.types.js";
import { generateId } from "../utils/id-utils.js";
import { MessageRoles, type TextGenerationOptions } from "../services/text-generation/text-generation-service.types.js";
import { streamTextGeneration } from "../services/text-generation/text-generation-service.js";
import { env } from "../config/env.js";
import { createMessageContentFromTemplate, createModelMessage } from "../utils/message-template.js";
import { container } from "../container.js";
import { RequestError } from "../core/error/request-error.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import type { CrowScheduler } from "../services/crow-scheduler.js";
import { TIME_MODE } from "@crow-central-agency/shared";
import { EventBus } from "../core/event-bus/event-bus.js";
import type { SimplyFeedManagerEvents } from "./simply-feed-manager.types.js";

const FEEDS_NAMESPACE = "feeds";
const FEEDS_STORE_TABLE = `${FEEDS_NAMESPACE}/feeds`;

const FEEDS_CACHE_MAX_AGE_IN_MINUTES = 5;
const DEFAULT_FEED_REFRESH_IN_MINUTES = 15;
const REFRESH_FEEDS_WORK_ID = "refresh-feeds";

/**
 * Tier prefixes for queryItems match scoring. Each tier's raw score
 * (matchType) is small (<= topics.size or queries.length, typically < 10),
 * so a gap of 100 guarantees tier ordering in the final sort: topic
 * matches always outrank category matches, which always outrank text
 * matches, regardless of how strongly each matched.
 */
const MATCH_TIER_TOPIC = 0;
const MATCH_TIER_CATEGORY = 100;
const MATCH_TIER_TEXT = 200;

const SummaryResultSchema = z.object({
  summary: z.string().describe("A concise summary of the content"),
  topics: z.array(z.string()).describe("Array of relevant topics extracted from the content"),
});

type SummaryResult = z.infer<typeof SummaryResultSchema>;

const TopicsResultSchema = z.object({
  topics: z.array(z.string()).describe("Array of relevant topics"),
});

type TopicsResult = z.infer<typeof TopicsResultSchema>;

export interface SimplyFeedManagerOptions {
  dataFolder?: string;
  storageConnectionString?: string;
  llmApiKey: string;
  llmBaseUrl?: string;
  llmModel?: string;
  retentionDays?: number;
}

const log = logger.child({ context: "simply-feed-manager" });

export class SimplyFeedManager extends EventBus<SimplyFeedManagerEvents> {
  private cachedFeeds: Map<string, Feed>;
  private cachedItems: Map<string, FeedItem[]>;
  private cachedFeedsTimestamp: number;
  private readonly hasTextGen: boolean;

  constructor(
    private readonly indexStore: ObjectStoreProvider,
    private readonly feedItemStore: ObjectStoreProvider,
    private readonly crowScheduler: CrowScheduler
  ) {
    super();
    this.cachedFeeds = new Map();
    this.cachedItems = new Map();
    this.cachedFeedsTimestamp = 0;
    this.hasTextGen = this.probeTextGen();
    if (!this.hasTextGen) {
      log.warn(
        "Feed text generation provider not configured — item summaries and topic-based search are disabled. Set FEED_TEXT_GENERATION_* env vars to enable."
      );
    }

    this.crowScheduler.scheduleWork(
      REFRESH_FEEDS_WORK_ID,
      TIME_MODE.EVERY,
      [{ minute: env.FEED_REFRESH_IN_MINUTES ?? DEFAULT_FEED_REFRESH_IN_MINUTES }],
      () => this.refreshAllFeeds()
    );
  }

  public async addFeed(feedUrl: string): Promise<Feed> {
    const feed = await this.getFeedFromUrl(feedUrl);
    if (feed) {
      return feed;
    }

    const newFeed = this.createFeed(feedUrl);
    try {
      await fetchItemsAndUpdateFeed(newFeed);
    } catch (error) {
      if (error instanceof RequestError) {
        log.warn({ feedUrl, statusCode: error.statusCode }, "Failed to fetch feed url");
        throw new AppError(`Failed to fetch feed, status: ${error.statusCode}`, APP_ERROR_CODES.FEED_FETCH_ERROR);
      }

      throw error;
    }

    this.cachedFeeds.set(newFeed.id, newFeed);
    await this.indexStore.set<Feed>(FEEDS_STORE_TABLE, newFeed.id, newFeed);

    this.emit("feedAdded", { feed: newFeed });

    return newFeed;
  }

  /**
   * Detect feeds advertised by a page URL via <link rel="alternate"> tags.
   * Each candidate is validated by fetching and parsing it; unreachable or
   * malformed feeds are dropped. Returns an empty array when no valid feed
   * is found. The returned feeds are stubs — not persisted.
   */
  public async detectFeeds(pageUrl: string): Promise<Feed[]> {
    let candidateUrls: string[];
    try {
      candidateUrls = await discoverFeedCandidates(pageUrl);
    } catch (error) {
      if (error instanceof RequestError) {
        log.warn({ pageUrl, statusCode: error.statusCode }, "Failed to fetch page url");
        throw new AppError(`Failed to fetch page, status: ${error.statusCode}`, APP_ERROR_CODES.FEED_FETCH_ERROR);
      }

      throw error;
    }

    if (candidateUrls.length === 0) {
      return [];
    }

    const results = await Promise.allSettled(
      candidateUrls.map(async (feedUrl) => {
        const feed = this.createFeed(feedUrl);
        await fetchItemsAndUpdateFeed(feed);
        return feed;
      })
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        log.warn({ pageUrl, feedUrl: candidateUrls[index], reason: result.reason }, "Feed candidate validation failed");
      }
    });

    return results
      .filter((result): result is PromiseFulfilledResult<Feed> => result.status === "fulfilled")
      .map((result) => result.value);
  }

  public async removeFeed(id: string): Promise<boolean> {
    const feed = await this.getFeed(id);
    if (!feed) {
      return false;
    }

    await this.indexStore.delete(FEEDS_STORE_TABLE, id);
    await this.indexStore.dropTable(this.getFeedIndexTable(id));
    await this.feedItemStore.dropTable(this.getFeedItemTable(id));
    this.cachedFeeds.delete(id);
    this.cachedItems.delete(id);

    this.emit("feedRemoved", { feedId: id });

    return true;
  }

  public async getFeed(id: string): Promise<Feed | undefined> {
    let feed = this.cachedFeeds.get(id);
    if (!feed) {
      try {
        const feedEntry = await this.indexStore.get<Feed>(FEEDS_STORE_TABLE, id);
        if (feedEntry?.value) {
          feed = feedEntry.value;
          this.cachedFeeds.set(feed.id, feed);
        }
      } catch (error) {
        log.error({ feedId: id, error }, `Failed to get feed`);
      }
    }

    return feed;
  }

  public async getFeedFromUrl(feedUrl: string): Promise<Feed | undefined> {
    let feed = Array.from(this.cachedFeeds.values()).find(
      (feed) => feed.feedUrl.toLowerCase() === feedUrl.toLowerCase()
    );
    if (!feed) {
      try {
        const feeds = await this.indexStore.query<Feed>(FEEDS_STORE_TABLE, [
          { field: "feedUrl", operator: STORE_QUERY_OPERATORS.EQ, value: feedUrl.toLowerCase() },
        ]);

        if (feeds.size) {
          feed = Array.from(feeds.values())[0].value;
          this.cachedFeeds.set(feed.id, feed);
        }
      } catch (error) {
        log.error({ feedUrl, error }, `Failed to get feed url`);
      }
    }

    return feed;
  }

  public async getFeeds(feedIds?: string[], limit?: number, skip?: number): Promise<Feed[]> {
    const feedIdSet = feedIds ? new Set(feedIds) : undefined;
    const targetFeeds = Array.from(this.cachedFeeds.values()).filter((feed) => !feedIdSet || feedIdSet.has(feed.id));
    if (targetFeeds.length && Date.now() - this.cachedFeedsTimestamp < FEEDS_CACHE_MAX_AGE_IN_MINUTES * 60 * 1000) {
      return targetFeeds.slice(skip || 0).slice(0, limit || undefined);
    }

    const feedEntries = await this.indexStore.getAll<Feed>(FEEDS_STORE_TABLE);
    const feeds = Array.from(feedEntries.values()).map((entry) => entry.value);
    feeds.forEach((feed) => {
      this.cachedFeeds.set(feed.id, feed);
    });

    this.cachedFeedsTimestamp = Date.now();
    return feeds
      .filter((feed) => !feedIdSet || feedIdSet.has(feed.id))
      .slice(skip || 0)
      .slice(0, limit || undefined);
  }

  public async queryFeeds(query: string, limit?: number, skip?: number): Promise<Feed[]> {
    const feeds = await this.getFeeds();
    const queries = query
      .split(" ")
      .map((query) => query.trim())
      .filter((query) => !!query);
    const matchedFeeds = feeds.filter((feed) => queries.some((query) => feed.title.includes(query)));
    return matchedFeeds.slice(skip || 0).slice(0, limit || undefined);
  }

  public async getItem(feedId: string, id: string): Promise<FeedItem> {
    const feed = await this.getFeed(feedId);
    if (!feed) {
      throw new Error("Invalid Feed ID.");
    }

    let foundItem: FeedItem | undefined;
    const cachedItems = this.cachedItems.get(feed.id);
    if (cachedItems) {
      foundItem = cachedItems.find((item) => item.id === id);
    }

    if (!foundItem) {
      const itemEntry = await this.feedItemStore.get<FeedItem>(this.getFeedItemTable(feed.id), id);
      foundItem = itemEntry?.value;
    }

    if (!foundItem) {
      throw new Error(`Item not found.`);
    }

    return foundItem;
  }

  public async getItemsFromFeed(
    id: string,
    limit?: number,
    skip?: number,
    startPublishedTime?: number
  ): Promise<FeedItem[]> {
    const feed = await this.getFeed(id);
    if (!feed) {
      return [];
    }

    let cachedItems = this.cachedItems.get(feed.id);
    if (!cachedItems || cachedItems.length === 0 || cachedItems[0].publishedTime < feed.latestItemPublishedTime) {
      let queryFromTime = 0;
      if (cachedItems && cachedItems.length > 0) {
        queryFromTime = cachedItems[0].publishedTime + 1;
      }

      const feedItemTable = this.getFeedItemTable(feed.id);
      const indexTable = this.getFeedIndexTable(feed.id);
      const itemIndexEntries = await this.indexStore.query<FeedIndexItem>(indexTable, [
        { field: "publishedTime", operator: STORE_QUERY_OPERATORS.GE, value: queryFromTime },
      ]);

      const itemEntries = await this.feedItemStore.getMany<FeedItem>(
        feedItemTable,
        Array.from(itemIndexEntries.values()).map((entry) => entry.value.id)
      );
      const items = Array.from(itemEntries.values()).map((entry) => entry.value);
      items.sort((a, b) => b.publishedTime - a.publishedTime);

      if (cachedItems && cachedItems.length > 0) {
        const mergedItems = [...items, ...cachedItems];
        // Remove duplicates based on guid or link
        const uniqueItems = mergedItems.filter((item, index, arr) => {
          const itemKey = item.guid?.guid || item.link;
          return arr.findIndex((i) => (i.guid?.guid || i.link) === itemKey) === index;
        });
        uniqueItems.sort((a, b) => b.publishedTime - a.publishedTime);
        this.cachedItems.set(feed.id, uniqueItems);
        cachedItems = uniqueItems;
      } else {
        // No cached items, store the queried items
        this.cachedItems.set(feed.id, items);
        cachedItems = items;
      }
    }

    const totalItems = cachedItems.length;
    if (startPublishedTime && cachedItems) {
      cachedItems = cachedItems.filter((item) => item.publishedTime >= startPublishedTime);
      log.debug(
        { feedId: feed.id, name: feed.title, startPublishedTime, totalItems },
        `${cachedItems.length} items found.`
      );
    }

    cachedItems.sort((a, b) => b.publishedTime - a.publishedTime);
    return cachedItems ? cachedItems.slice(skip || 0).slice(0, limit || undefined) : [];
  }

  public async getRecentItems(
    recencyInMinutes: number,
    feedIds?: string[],
    limit?: number,
    skip?: number
  ): Promise<FeedItem[]> {
    const recencyCutOff = Date.now() - recencyInMinutes * 60 * 1000;
    const allRecentItems: FeedItem[] = [];

    const feeds = await this.getFeeds(feedIds);
    for (const feed of feeds) {
      const items = await this.getItemsFromFeed(feed.id, undefined, undefined, recencyCutOff);
      allRecentItems.push(...items);
    }

    allRecentItems.sort((a, b) => b.publishedTime - a.publishedTime);
    return allRecentItems.slice(skip || 0).slice(0, limit || undefined);
  }

  public async queryItems(query: string, feedIds?: string[], limit?: number, skip?: number): Promise<FeedItem[]> {
    query = query.trim();
    if (!query) {
      return [];
    }

    const feeds = await this.getFeeds(feedIds);
    for (const feed of feeds) {
      await this.getItemsFromFeed(feed.id);
    }

    const queryFeedsId = new Set<string>(feeds.map((feed) => feed.id));

    const queries = query
      .toLowerCase()
      .split(" ")
      .map((word) => word.trim())
      .filter((word) => !!word);
    const topicsRes = this.hasTextGen ? await this.determineTopics(query) : undefined;
    const topics = new Set<string>(topicsRes ? topicsRes.topics : queries);

    const matchedItems: { item: FeedItem; matchType: number }[] = [];
    for (const [feedId, feedItems] of this.cachedItems.entries()) {
      if (!queryFeedsId.has(feedId)) {
        continue;
      }

      feedItems.forEach((item) => {
        // 1. Topic match — LLM-derived semantic topics.
        const matchedTopics = item.topics?.filter((topic) => topics.has(topic)).length;
        if (matchedTopics) {
          matchedItems.push({ item, matchType: MATCH_TIER_TOPIC + (topics.size - matchedTopics) });
          return;
        }

        // 2. Category match — feed-asserted taxonomy from <category> elements.
        const matchedCategories = item.categories?.filter((category) =>
          queries.some((word) => category.toLowerCase().includes(word))
        ).length;
        if (matchedCategories) {
          matchedItems.push({ item, matchType: MATCH_TIER_CATEGORY + (queries.length - matchedCategories) });
          return;
        }

        // 3. Text fallback — title + description only. `description` is the RSS excerpt;
        //    item.content is skipped because full article bodies can be large.
        const haystack = `${item.title} ${item.description}`.toLowerCase();
        const matchedWords = queries.filter((word) => haystack.includes(word)).length;
        if (matchedWords) {
          matchedItems.push({ item, matchType: MATCH_TIER_TEXT + (queries.length - matchedWords) });
        }
      });
    }

    matchedItems.sort((a, b) => {
      if (a.matchType === b.matchType) {
        return b.item.publishedTime - a.item.publishedTime;
      }

      return a.matchType - b.matchType;
    });

    return matchedItems
      .map((item) => item.item)
      .slice(skip || 0)
      .slice(0, limit || undefined);
  }

  public async refreshFeed(id: string, includeExistingTopics: boolean = false): Promise<FeedItem[]> {
    const feed = await this.getFeed(id);
    if (!feed) {
      log.error({ feedId: id }, `Failed to find feed ID`);
      return [];
    }

    let items: FeedItem[];
    try {
      items = await fetchItemsAndUpdateFeed(feed);
    } catch (error) {
      log.error({ feedId: id, feedUrl: feed.feedUrl, error }, `Failed to fetch from url`);
      return [];
    }

    const currentFeedItems = await this.getItemsFromFeed(feed.id);
    const existingItemKeys = new Set(currentFeedItems.map((item) => item.guid?.guid || item.link));
    const retentionDays = env.FEED_ITEM_RETENTION_DAYS ?? 0;
    const expiredBefore = retentionDays > 0 ? Date.now() - retentionDays * 24 * 60 * 60 * 1000 : 0;
    // Drop items already published before the retention window so they don't
    // trigger summaries, storage writes, or newFeedItems notifications for
    // feeds that keep stale entries in their backlog.
    const newItems = items.filter((item) => {
      const itemKey = item.guid?.guid || item.link;
      if (existingItemKeys.has(itemKey)) {
        return false;
      }

      return expiredBefore === 0 || item.publishedTime > expiredBefore;
    });

    // Only retry unsummarized items when the LLM is available; otherwise the retry
    // set grows without bound and every refresh spams failures into the log.
    const retryItems = this.hasTextGen ? currentFeedItems.filter((existingItem) => !existingItem.summary) : [];

    const topics =
      this.hasTextGen && includeExistingTopics
        ? currentFeedItems.reduce((topics, item) => {
            item.topics?.forEach((topic) => topics.add(topic));
            return topics;
          }, new Set<string>())
        : new Set<string>();

    const processingItems = newItems.concat(retryItems);
    if (processingItems.length > 0) {
      if (this.hasTextGen) {
        for (const processItem of processingItems) {
          try {
            const text = processItem.title.concat("\n", processItem.content || processItem.description);
            const res = await this.generateSummary(text, topics);
            if (res) {
              processItem.summary = res.summary;
              processItem.topics = res.topics;
              res.topics.forEach((topic) => topics.add(topic));
            }
          } catch (error) {
            log.error({ feedItemId: processItem.id, error }, `Failed to generate summary for item`);
          }
        }
      }

      const updatedItems = [...currentFeedItems, ...newItems].sort((a, b) => b.publishedTime - a.publishedTime);
      this.cachedItems.set(feed.id, updatedItems);

      await this.indexStore.setMany<FeedIndexItem>(
        this.getFeedIndexTable(feed.id),
        processingItems.map((item) => [item.id, this.getFeedIndexItem(item)])
      );
      await this.feedItemStore.setMany<FeedItem>(
        this.getFeedItemTable(feed.id),
        processingItems.map((item) => [item.id, item])
      );
      log.info(`${processingItems.length} new items processed for feed [${feed.title}]`);
    }

    if (retentionDays > 0) {
      const cached = this.cachedItems.get(feed.id) ?? currentFeedItems;
      const expiredIds = cached.filter((item) => item.publishedTime <= expiredBefore).map((item) => item.id);

      if (expiredIds.length > 0) {
        const indexTable = this.getFeedIndexTable(feed.id);
        const itemTable = this.getFeedItemTable(feed.id);
        const deleteResults = await Promise.allSettled(
          expiredIds.flatMap((id) => [this.indexStore.delete(indexTable, id), this.feedItemStore.delete(itemTable, id)])
        );

        const failures = deleteResults.filter((result) => result.status === "rejected");
        if (failures.length > 0) {
          log.warn(
            { feedId: feed.id, feedName: feed.title, failureCount: failures.length },
            "Some expired feed item deletions failed; will retry on next refresh"
          );
        }

        const expiredIdSet = new Set(expiredIds);
        this.cachedItems.set(
          feed.id,
          cached.filter((item) => !expiredIdSet.has(item.id))
        );

        log.info(
          { feedId: feed.id, feedName: feed.title, expiredCount: expiredIds.length },
          "Pruned expired feed items"
        );
      }
    }

    // update feed
    await this.indexStore.set<Feed>(FEEDS_STORE_TABLE, feed.id, feed);

    if (newItems.length > 0) {
      this.emit("newFeedItems", { feed, items: newItems });
    }

    return newItems;
  }

  /** Attempt to resolve the feed text-gen provider once at startup; false when unconfigured. */
  private probeTextGen(): boolean {
    try {
      const provider = container.feedTextGenProvider;
      return !!provider;
    } catch (error) {
      if (error instanceof AppError && error.errorCode === APP_ERROR_CODES.NOT_SUPPORTED) {
        return false;
      }

      throw error;
    }
  }

  private async refreshAllFeeds(): Promise<void> {
    // Scheduled entry point — swallow errors so one failure does not kill the scheduler.
    try {
      const feeds = await this.getFeeds();
      for (const feed of feeds) {
        try {
          const items = await this.refreshFeed(feed.id, false);
          log.info({ feedId: feed.id, feedName: feed.title, newItemsCount: items.length }, "Refreshed feed");
        } catch (error) {
          log.error({ feedId: feed.id, feedName: feed.title, error }, "Failed to refresh feed");
        }
      }
    } catch (error) {
      log.error({ error }, "Failed to enumerate feeds for refresh");
    }
  }

  private async generateSummary(text: string, topicsSet: Set<string>): Promise<SummaryResult | undefined> {
    try {
      const noTopics = topicsSet.size > 0 ? undefined : "true";
      const topics = topicsSet.size > 0 ? Array.from(topicsSet).sort().join(", ") : undefined;

      const userPrompt = createMessageContentFromTemplate(SUMMARY_USER_PROMPT, { text });
      const response = await this.generateResponse(userPrompt, {
        systemPrompt: SUMMARY_SYSTEM_PROMPT,
        useJsonSchema: {
          name: "summary_result",
          schema: SummaryResultSchema.toJSONSchema(),
        },
        customPromptContext: { topics, noTopics },
      });

      if (!response) {
        throw new Error("Empty content");
      }

      const parsed = JSON.parse(response);
      const result = SummaryResultSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`Schema validation failed: ${result.error.message}`);
      }

      result.data.topics = result.data.topics.map((topic) => topic.toLowerCase());
      return result.data;
    } catch (error) {
      log.error({ error }, `Failed to summarize text.`);
    }

    return undefined;
  }

  private async determineTopics(text: string): Promise<TopicsResult | undefined> {
    try {
      const userPrompt = createMessageContentFromTemplate(QUERY_USER_PROMPT, { text });
      const response = await this.generateResponse(userPrompt, {
        systemPrompt: SUMMARY_SYSTEM_PROMPT,
        useJsonSchema: {
          name: "topics_result",
          schema: TopicsResultSchema.toJSONSchema(),
        },
      });

      if (!response) {
        throw new Error("Empty content");
      }

      const parsed = JSON.parse(response);
      const result = TopicsResultSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`Schema validation failed: ${result.error.message}`);
      }

      result.data.topics = result.data.topics.map((topic) => topic.toLowerCase());
      return result.data;
    } catch (error) {
      log.error({ error }, `Failed to determine topics.`);
    }

    return undefined;
  }

  private async generateResponse(prompt: string, options: TextGenerationOptions): Promise<string> {
    const stream = streamTextGeneration(
      env.FEED_TEXT_GENERATION_MODEL ?? "default",
      [createModelMessage(prompt, MessageRoles.user)],
      { ...options, provider: container.feedTextGenProvider }
    );

    let result = "";
    for await (const event of stream) {
      if (event.type === "messagedone") {
        result = event.content;
      }
    }

    return result;
  }

  private createFeed(feedUrl: string): Feed {
    return {
      id: generateId(),
      title: "Untitled Feed",
      subtitle: "",
      description: "",
      feedUrl: feedUrl,
      latestItemPublishedTime: 0,
      firstItemPublishedTime: 0,
      lastUpdateTime: Date.now(),
    };
  }

  private getFeedIndexItem(feedItem: FeedItem): FeedIndexItem {
    return {
      id: feedItem.id,
      feedItemType: feedItem.feedItemType,
      title: feedItem.title,
      guid: feedItem.guid,
      publishedTime: feedItem.publishedTime,
    };
  }

  private getFeedItemTable(feedId: string): string {
    return `${FEEDS_NAMESPACE}/${feedId}/items`;
  }

  private getFeedIndexTable(feedId: string): string {
    return `${FEEDS_NAMESPACE}/${feedId}/feedIndex`;
  }
}
