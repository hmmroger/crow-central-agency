import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { PlacesManager } from "../../services/places/places-manager.js";
import type { McpServerDefinition, McpServerFactory } from "../crow-mcp-manager.types.js";
import { getGeocodePlaceToolConfig } from "./geocode-place.js";
import { getGetPlaceDetailsToolConfig } from "./get-place-details.js";
import { getSearchNearbyPlacesToolConfig } from "./search-nearby-places.js";

export const PLACES_MCP_SERVER_NAME = "crow-places";

export function createPlacesMcpServer(placesManager: PlacesManager): McpSdkServerConfigWithInstance {
  const geocode = getGeocodePlaceToolConfig(placesManager);
  const searchNearby = getSearchNearbyPlacesToolConfig(placesManager);
  const getDetails = getGetPlaceDetailsToolConfig(placesManager);

  return createSdkMcpServer({
    name: PLACES_MCP_SERVER_NAME,
    tools: [
      tool(geocode.name, geocode.description, geocode.inputSchema, geocode.handler, {
        annotations: geocode.annotations,
      }),
      tool(searchNearby.name, searchNearby.description, searchNearby.inputSchema, searchNearby.handler, {
        annotations: searchNearby.annotations,
      }),
      tool(getDetails.name, getDetails.description, getDetails.inputSchema, getDetails.handler, {
        annotations: getDetails.annotations,
      }),
    ],
  });
}

export function getPlacesMcpServerDefinition(placesManager: PlacesManager): McpServerDefinition {
  const serverFactory: McpServerFactory = () => createPlacesMcpServer(placesManager);
  return {
    serverFactory,
    isConfigurable: true,
    displayName: "Places",
  };
}
