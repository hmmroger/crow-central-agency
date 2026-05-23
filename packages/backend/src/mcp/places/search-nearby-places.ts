import { z } from "zod";
import type { PlacesManager } from "../../services/places/places-manager.js";
import { PLACE_CATEGORY, type PlaceCategory } from "../../services/places/places-manager.types.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatPlaceSummary } from "./places-format-utils.js";

const DEFAULT_SEARCH_NEARBY_LIMIT = 20;
const MAX_SEARCH_NEARBY_LIMIT = 50;
const MAX_SEARCH_NEARBY_RADIUS_METERS = 50_000;

const CATEGORY_VALUES = Object.values(PLACE_CATEGORY) as [PlaceCategory, ...PlaceCategory[]];

export const SEARCH_NEARBY_PLACES_TOOL_NAME = "search_nearby_places";

export function getSearchNearbyPlacesToolConfig(placesManager: PlacesManager) {
  const inputSchema = {
    latitude: z.number().min(-90).max(90).describe("Latitude of the search center."),
    longitude: z.number().min(-180).max(180).describe("Longitude of the search center."),
    radiusMeters: z
      .number()
      .int()
      .positive()
      .max(MAX_SEARCH_NEARBY_RADIUS_METERS)
      .describe(`Search radius in meters (max ${MAX_SEARCH_NEARBY_RADIUS_METERS}).`),
    category: z
      .enum(CATEGORY_VALUES)
      .describe("Curated place category to filter by. Use OTHER only as a last resort - prefer a more specific value."),
    limit: z
      .number()
      .int()
      .positive()
      .max(MAX_SEARCH_NEARBY_LIMIT)
      .optional()
      .describe(`Max results to return (default ${DEFAULT_SEARCH_NEARBY_LIMIT}, max ${MAX_SEARCH_NEARBY_LIMIT}).`),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      const places = await placesManager.searchPlaces({
        area: {
          type: "radius",
          center: { latitude: args.latitude, longitude: args.longitude },
          radiusMeters: args.radiusMeters,
        },
        category: args.category,
        limit: args.limit ?? DEFAULT_SEARCH_NEARBY_LIMIT,
      });

      const areaLabel = `within ${args.radiusMeters}m of ${args.latitude.toFixed(6)}, ${args.longitude.toFixed(6)}`;
      if (places.length === 0) {
        return textToolResult([`No ${args.category} places found ${areaLabel}.`]);
      }

      const header = `[Nearby ${args.category} places: ${places.length} ${areaLabel}]`;
      const body = places.map(formatPlaceSummary).join("\n");
      return textToolResult([header, body]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to search nearby places.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: SEARCH_NEARBY_PLACES_TOOL_NAME,
    description:
      "Find places of a given category within a radius around a point. Use get_place_details with a returned id for opening hours, contact info, and other attributes.",
    inputSchema,
    handler,
  };

  return config;
}
