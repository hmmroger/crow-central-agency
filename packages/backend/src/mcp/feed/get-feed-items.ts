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

export const GET_FEED_ITEMS_TOOL_NAME = "get_feed_items";

export function getFeedItemsToolConfig(
  agentId: string,
  registry: AgentRegistry,
  feedManager: SimplyFeedManager,
  sensorManager: SensorManager,
  systemSettingsManager: SystemSettingsManager
) {
  const inputSchema = {
    feedId: z.string().describe("The news/RSS feed ID from which to get items."),
    limit: z.number().optional().describe(`Number of items to return per page.`),
    skip: z.number().optional().describe("Number of items to skip for pagination."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ feedId, limit, skip }) => {
    try {
      const visibleFeedIds = await resolveVisibleFeedIds(agentId, registry, systemSettingsManager);
      if (!visibleFeedIds.has(feedId)) {
        throw new Error("Feed ID not found.");
      }

      const feed = await feedManager.getFeed(feedId);
      if (!feed) {
        throw new Error("Ensure correct feed ID is used.");
      }

      const timezone = await sensorManager.getUserTimezone();
      const allItems = await feedManager.getItemsFromFeed(feedId);
      const pagination = applyPagination(allItems, limit || DEFAULT_FEED_ITEMS_LIMIT, skip);
      const formattedItems = pagination.items.map((item) => formatFeedItemSummary(item, feed.title, timezone));
      const header = formatPaginationHeader(
        `Items from feed [${feed.title}]`,
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
      return getErrorToolResult(error, "Failed to list feed items.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: GET_FEED_ITEMS_TOOL_NAME,
    description: `Get items from a specific feed by feed ID, ordered newest first (default: ${DEFAULT_FEED_ITEMS_LIMIT} items). Use list_feeds to discover available feed IDs.`,
    inputSchema,
    handler,
  };

  return config;
}
