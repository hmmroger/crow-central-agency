import { z } from "zod";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { SimplyFeedManager } from "../../feed/simply-feed-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { SystemSettingsManager } from "../../services/system-settings-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, processTextContent, textToolResult } from "../tool-utils.js";
import { formatLocalDateTime } from "../../utils/date-utils.js";
import { resolveVisibleFeedIds } from "./feed-tool-utils.js";

export const GET_FEED_ITEM_CONTENT_TOOL_NAME = "get_feed_item_content";

export function getFeedItemContentToolConfig(
  agentId: string,
  registry: AgentRegistry,
  feedManager: SimplyFeedManager,
  sensorManager: SensorManager,
  systemSettingsManager: SystemSettingsManager
) {
  const inputSchema = {
    feedId: z.string().describe("The news/RSS feed ID that owns the item."),
    id: z.string().describe("The feed item ID to read. Found in the `ID:` field of list/search results."),
    showLineNumber: z.boolean().optional().describe("Optional. Add line marker in the result."),
    startLine: z
      .number()
      .min(1)
      .optional()
      .describe("Optional. Starting line number (1-based) to begin reading from (default: 1)."),
    limit: z
      .number()
      .min(1)
      .optional()
      .describe("Optional. Maximum number of lines to return starting from startLine."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ feedId, id, showLineNumber, startLine, limit }) => {
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
      const feedItem = await feedManager.getItem(feedId, id);

      const header = [
        `--- METADATA ---`,
        `[Type: ${feedItem.feedItemType} | Published: ${formatLocalDateTime(feedItem.publishedTime, timezone)}]`,
      ];

      if (feedItem.enclosureUrl) {
        header.push(`[Enclosure URL: ${feedItem.enclosureUrl}]`);
      }

      const processedContent = processTextContent(feedItem.content, { showLineNumber, startLine, limit });

      return textToolResult(header.concat(processedContent.headerParts).concat(["", processedContent.text]));
    } catch (error) {
      return getErrorToolResult(error, "Failed to get feed item content.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: GET_FEED_ITEM_CONTENT_TOOL_NAME,
    description: `Get the full text content of a feed item by its feed ID and item ID. Use get_feed_items, get_recent_feed_items, or search_feed_items to discover item IDs. Content is extracted from the feed's RSS/Atom payload and may be abridged — follow the item's Link to read the original article when you need the complete text.`,
    inputSchema,
    handler,
  };

  return config;
}
