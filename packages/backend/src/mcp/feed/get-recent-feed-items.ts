import { z } from "zod";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { SimplyFeedManager } from "../../feed/simply-feed-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { SystemSettingsManager } from "../../services/system-settings-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { applyPagination, formatPaginationHeader, getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatFeedItemSummary } from "./feed-format-utils.js";
import { resolveVisibleFeedIds } from "./feed-tool-utils.js";

const DEFAULT_RECENCY_IN_MINUTES = 2 * 60;
const DEFAULT_FEED_ITEMS_LIMIT = 50;

export const GET_RECENT_FEED_ITEMS_TOOL_NAME = "get_recent_feed_items";

export function getRecentFeedItemsToolConfig(
  agentId: string,
  registry: AgentRegistry,
  feedManager: SimplyFeedManager,
  sensorManager: SensorManager,
  systemSettingsManager: SystemSettingsManager
) {
  const inputSchema = {
    recencyInMinutes: z
      .number()
      .default(DEFAULT_RECENCY_IN_MINUTES)
      .optional()
      .describe(`Number of minutes to look back from now for recent items (default: ${DEFAULT_RECENCY_IN_MINUTES}).`),
    limit: z.number().optional().describe(`Number of items to return per page.`),
    skip: z.number().optional().describe("Number of items to skip for pagination."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ recencyInMinutes, limit, skip }) => {
    try {
      const timezone = await sensorManager.getUserTimezone();
      const visibleFeedIdSet = await resolveVisibleFeedIds(agentId, registry, systemSettingsManager);
      const visibleFeedIds = Array.from(visibleFeedIdSet);

      const effectiveRecency = recencyInMinutes || DEFAULT_RECENCY_IN_MINUTES;
      const feeds = await feedManager.getFeeds(visibleFeedIds);
      const feedsMap = new Map<string, string>(feeds.map((feed) => [feed.id, feed.title]));

      const allItems = await feedManager.getRecentItems(effectiveRecency, visibleFeedIds);
      if (!allItems.length) {
        return textToolResult([`No items found in the last ${effectiveRecency} minutes. Try increase the minutes.`]);
      }

      const pagination = applyPagination(allItems, limit || DEFAULT_FEED_ITEMS_LIMIT, skip);
      const formattedItems = pagination.items.map((item) =>
        formatFeedItemSummary(item, feedsMap.get(item.feedId), timezone)
      );
      const header = formatPaginationHeader(
        `Recent items from all feeds (last ${effectiveRecency} minutes)`,
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
      return getErrorToolResult(error, "Failed to query recent items.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: GET_RECENT_FEED_ITEMS_TOOL_NAME,
    description: `Get recent items across your available feeds within a time window (default: last ${DEFAULT_RECENCY_IN_MINUTES} minutes, ${DEFAULT_FEED_ITEMS_LIMIT} items). Use this to catch up on new content without specifying a feed.`,
    inputSchema,
    handler,
  };

  return config;
}
