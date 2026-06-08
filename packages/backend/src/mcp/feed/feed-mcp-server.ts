import type { SimplyFeedManager } from "../../feed/simply-feed-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { SystemSettingsManager } from "../../services/system-settings-manager.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getListFeedsToolConfig } from "./list-feeds.js";
import { getFeedItemsToolConfig } from "./get-feed-items.js";
import { getRecentFeedItemsToolConfig } from "./get-recent-feed-items.js";
import { getSearchFeedItemsToolConfig } from "./search-feed-items.js";
import { getFeedItemContentToolConfig } from "./get-feed-item-content.js";

export const FEED_MCP_SERVER_NAME = "crow-feed";

export function getFeedMcpServerDefinition(
  registry: AgentRegistry,
  feedManager: SimplyFeedManager,
  sensorManager: SensorManager,
  systemSettingsManager: SystemSettingsManager
): McpServerDefinition {
  return {
    name: FEED_MCP_SERVER_NAME,
    getTools: (agentId) => [
      defineMcpTool(getListFeedsToolConfig(agentId, registry, feedManager, sensorManager, systemSettingsManager)),
      defineMcpTool(getFeedItemsToolConfig(agentId, registry, feedManager, sensorManager, systemSettingsManager)),
      defineMcpTool(getRecentFeedItemsToolConfig(agentId, registry, feedManager, sensorManager, systemSettingsManager)),
      defineMcpTool(getSearchFeedItemsToolConfig(agentId, registry, feedManager, sensorManager, systemSettingsManager)),
      defineMcpTool(getFeedItemContentToolConfig(agentId, registry, feedManager, sensorManager, systemSettingsManager)),
    ],
  };
}
