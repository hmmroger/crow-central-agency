import { z } from "zod";
import type { SimplyFeedManager } from "../../feed/simply-feed-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { applyPagination, formatPaginationHeader, getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatFeed } from "./feed-format-utils.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { SystemSettingsManager } from "../../services/system-settings-manager.js";
import { resolveVisibleFeedIds } from "./feed-tool-utils.js";

const DEFAULT_FEEDS_LIMIT = 50;

export const LIST_FEEDS_TOOL_NAME = "list_feeds";

export function getListFeedsToolConfig(
  agentId: string,
  registry: AgentRegistry,
  feedManager: SimplyFeedManager,
  sensorManager: SensorManager,
  systemSettingsManager: SystemSettingsManager
) {
  const inputSchema = {
    limit: z.number().optional().describe(`Number of feeds to return per page.`),
    skip: z.number().optional().describe("Number of feeds to skip for pagination."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ limit, skip }) => {
    try {
      const timezone = await sensorManager.getUserTimezone();
      const visibleFeedIdSet = await resolveVisibleFeedIds(agentId, registry, systemSettingsManager);
      const feeds = await feedManager.getFeeds(Array.from(visibleFeedIdSet));

      const pagination = applyPagination(feeds, limit || DEFAULT_FEEDS_LIMIT, skip);
      const formattedFeeds = pagination.items.map((feed) => formatFeed(feed, timezone));
      const header = formatPaginationHeader("Available feeds", pagination);
      return textToolResult(header.concat("", formattedFeeds));
    } catch (error) {
      return getErrorToolResult(error, "Failed to list feeds.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: LIST_FEEDS_TOOL_NAME,
    description: `List all available RSS/news feeds with their names, IDs, and latest publish times (default: ${DEFAULT_FEEDS_LIMIT} feeds). Call this first to discover feed IDs needed by other tools.`,
    inputSchema,
    handler,
  };

  return config;
}
