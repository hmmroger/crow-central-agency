import { z } from "zod";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { SimplyFeedManager } from "../../feed/simply-feed-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { SystemSettingsManager } from "../../services/system-settings-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { applyPagination, formatPaginationHeader, getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatFeedItemSummary } from "./feed-format-utils.js";
import { resolveVisibleFeedIds } from "./feed-tool-utils.js";

const DEFAULT_FEED_ITEMS_LIMIT = 50;

export const SEARCH_FEED_ITEMS_TOOL_NAME = "search_feed_items";

export function getSearchFeedItemsToolConfig(
  agentId: string,
  registry: AgentRegistry,
  feedManager: SimplyFeedManager,
  sensorManager: SensorManager,
  systemSettingsManager: SystemSettingsManager
) {
  const inputSchema = {
    query: z.string().describe("Natural-language phrase or topic to match against feed items."),
    feedId: z.string().optional().describe("Optional feed ID to filter search results to a specific feed."),
    limit: z.number().optional().describe(`Number of items to return per page.`),
    skip: z.number().optional().describe("Number of items to skip for pagination."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ query, feedId, limit, skip }) => {
    try {
      const timezone = await sensorManager.getUserTimezone();
      const visibleFeedIdSet = await resolveVisibleFeedIds(agentId, registry, systemSettingsManager);
      if (feedId && !visibleFeedIdSet.has(feedId)) {
        throw new Error("Feed ID not found.");
      }

      const visibleFeedIds = Array.from(visibleFeedIdSet);
      const feeds = await feedManager.getFeeds(visibleFeedIds);
      const feedsMap = new Map<string, string>(feeds.map((feed) => [feed.id, feed.title]));

      const allItems = await feedManager.queryItems(query, feedId ? [feedId] : visibleFeedIds);
      if (!allItems.length) {
        return textToolResult([`No items found matching "${query}".`]);
      }

      const pagination = applyPagination(allItems, limit || DEFAULT_FEED_ITEMS_LIMIT, skip);
      const formattedItems = pagination.items.map((item) =>
        formatFeedItemSummary(item, feedsMap.get(item.feedId), timezone)
      );
      const header = formatPaginationHeader(
        `Items matching "${query}"`,
        pagination,
        "Items show summary only — use get_feed_item_content with an item ID for full content"
      );
      return textToolResult(
        header.concat(
          "",
          formattedItems.flatMap((item) => [item, "---"])
        )
      );
    } catch (error) {
      return getErrorToolResult(error, "Failed to search feed items.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: SEARCH_FEED_ITEMS_TOOL_NAME,
    description: `Search feed items by query across your available feeds, or filter to a specific feed with feedId (default: ${DEFAULT_FEED_ITEMS_LIMIT} items). Use this to find items about a specific topic.`,
    inputSchema,
    handler,
  };

  return config;
}
