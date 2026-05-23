import { z } from "zod";
import type { PlacesManager } from "../../services/places/places-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatPlaceDetails } from "./places-format-utils.js";

export const GET_PLACE_DETAILS_TOOL_NAME = "get_place_details";

export function getGetPlaceDetailsToolConfig(placesManager: PlacesManager) {
  const inputSchema = {
    id: z
      .string()
      .min(1)
      .describe(
        "Place ID returned by geocode_place or search_nearby_places (e.g. 'OSM:node/12345'). The prefix selects the data source."
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      const details = await placesManager.getPlaceById(args.id);
      if (!details) {
        return textToolResult([`No place found for id: ${args.id}`]);
      }

      return textToolResult([formatPlaceDetails(details)]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to load place details.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: GET_PLACE_DETAILS_TOOL_NAME,
    description:
      "Fetch full attributes for a place: opening hours (weekly schedule), phone, website, email, wheelchair access, cuisines, brand, and free-text description. Use after geocode_place or search_nearby_places returns the id of interest.",
    inputSchema,
    handler,
  };

  return config;
}
