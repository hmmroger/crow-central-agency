import type { FastifyInstance } from "fastify";
import { AddFeedInputSchema, DetectFeedsInputSchema, type FeedInfo } from "@crow-central-agency/shared";
import type { SimplyFeedManager } from "../feed/simply-feed-manager.js";
import type { Feed } from "../feed/simply-feed.types.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { wrapZodError } from "./route-utils.js";

/** Map internal Feed to API-facing FeedInfo */
function toFeedInfo(feed: Feed): FeedInfo {
  return {
    id: feed.id,
    title: feed.title,
    feedUrl: feed.feedUrl,
    description: feed.description,
    link: feed.link,
    imageUrl: feed.imageUrl,
    language: feed.language,
    categories: feed.categories,
    isUnreachable: feed.isUnreachable,
    latestItemPublishedTime: feed.latestItemPublishedTime,
    lastUpdateTime: feed.lastUpdateTime,
  };
}

/**
 * Register feed configuration routes.
 * Manages RSS/Atom feed subscriptions via SimplyFeedManager.
 */
export async function registerFeedRoutes(server: FastifyInstance, feedManager: SimplyFeedManager) {
  /** List all feeds */
  server.get("/api/feeds", async () => {
    const feeds = await feedManager.getFeeds();

    return { success: true, data: feeds.map(toFeedInfo) };
  });

  /** Add a new feed by URL */
  server.post<{ Body: unknown }>("/api/feeds", async (request) => {
    try {
      const input = AddFeedInputSchema.parse(request.body);
      const feed = await feedManager.addFeed(input.feedUrl);

      return { success: true, data: toFeedInfo(feed) };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Detect feeds advertised by a page URL via <link rel="alternate"> tags */
  server.post<{ Body: unknown }>("/api/feeds/detect", async (request) => {
    try {
      const input = DetectFeedsInputSchema.parse(request.body);
      const feeds = await feedManager.detectFeeds(input.url);

      return { success: true, data: feeds.map(toFeedInfo) };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Remove a feed */
  server.delete<{ Params: { id: string } }>("/api/feeds/:id", async (request) => {
    const deleted = await feedManager.removeFeed(request.params.id);
    if (!deleted) {
      throw new AppError(`Feed ${request.params.id} not found`, APP_ERROR_CODES.NOT_FOUND);
    }

    return { success: true, data: { deleted: true } };
  });
}
