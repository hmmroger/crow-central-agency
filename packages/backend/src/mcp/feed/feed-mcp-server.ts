import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { SimplyFeedManager } from "../../feed/simply-feed-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { SystemSettingsManager } from "../../services/system-settings-manager.js";
import { getListFeedsToolConfig } from "./list-feeds.js";
import { getFeedItemsToolConfig } from "./get-feed-items.js";
import { getRecentFeedItemsToolConfig } from "./get-recent-feed-items.js";
import { getSearchFeedItemsToolConfig } from "./search-feed-items.js";
import { getFeedItemContentToolConfig } from "./get-feed-item-content.js";

export const FEED_MCP_SERVER_NAME = "crow-feed";

export function createFeedMcpServer(
  agentId: string,
  registry: AgentRegistry,
  feedManager: SimplyFeedManager,
  sensorManager: SensorManager,
  systemSettingsManager: SystemSettingsManager
): McpSdkServerConfigWithInstance {
  const listFeeds = getListFeedsToolConfig(agentId, registry, feedManager, sensorManager, systemSettingsManager);
  const getFeedItems = getFeedItemsToolConfig(agentId, registry, feedManager, sensorManager, systemSettingsManager);
  const getRecentFeedItems = getRecentFeedItemsToolConfig(
    agentId,
    registry,
    feedManager,
    sensorManager,
    systemSettingsManager
  );
  const searchFeedItems = getSearchFeedItemsToolConfig(
    agentId,
    registry,
    feedManager,
    sensorManager,
    systemSettingsManager
  );
  const getFeedItemContent = getFeedItemContentToolConfig(
    agentId,
    registry,
    feedManager,
    sensorManager,
    systemSettingsManager
  );

  return createSdkMcpServer({
    name: FEED_MCP_SERVER_NAME,
    tools: [
      tool(listFeeds.name, listFeeds.description, listFeeds.inputSchema, listFeeds.handler, {
        annotations: listFeeds.annotations,
      }),
      tool(getFeedItems.name, getFeedItems.description, getFeedItems.inputSchema, getFeedItems.handler, {
        annotations: getFeedItems.annotations,
      }),
      tool(
        getRecentFeedItems.name,
        getRecentFeedItems.description,
        getRecentFeedItems.inputSchema,
        getRecentFeedItems.handler,
        { annotations: getRecentFeedItems.annotations }
      ),
      tool(searchFeedItems.name, searchFeedItems.description, searchFeedItems.inputSchema, searchFeedItems.handler, {
        annotations: searchFeedItems.annotations,
      }),
      tool(
        getFeedItemContent.name,
        getFeedItemContent.description,
        getFeedItemContent.inputSchema,
        getFeedItemContent.handler,
        { annotations: getFeedItemContent.annotations }
      ),
    ],
  });
}
