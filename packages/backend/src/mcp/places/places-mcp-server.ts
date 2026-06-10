import type { PlacesManager } from "../../services/places/places-manager.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getGeocodePlaceToolConfig } from "./geocode-place.js";
import { getGetPlaceDetailsToolConfig } from "./get-place-details.js";
import { getSearchNearbyPlacesToolConfig } from "./search-nearby-places.js";

export const PLACES_MCP_SERVER_NAME = "crow-places";

export function getPlacesMcpServerDefinition(placesManager: PlacesManager): McpServerDefinition {
  return {
    name: PLACES_MCP_SERVER_NAME,
    isConfigurable: true,
    displayName: "Places",
    getTools: () => [
      defineMcpTool(getGeocodePlaceToolConfig(placesManager)),
      defineMcpTool(getSearchNearbyPlacesToolConfig(placesManager)),
      defineMcpTool(getGetPlaceDetailsToolConfig(placesManager)),
    ],
  };
}
