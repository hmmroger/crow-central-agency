import { z } from "zod";
import type { PlacesManager } from "../../services/places/places-manager.js";
import { PLACES_SOURCE, type PlacesSource } from "../../services/places/places-manager.types.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatPlaceSummary } from "./places-format-utils.js";

const DEFAULT_GEOCODE_LIMIT = 10;
const MAX_GEOCODE_LIMIT = 25;

export const GEOCODE_PLACE_TOOL_NAME = "geocode_place";

const NEUTRAL_DESCRIPTION =
  "Resolve a free-text query - a place name, full address, or landmark - to matching places. " +
  "Use get_place_details on a returned id for opening hours, contact info, and other attributes.";

const NEUTRAL_RESULT_GUIDANCE =
  "Refine with a more specific name, address, or the city/country disambiguators if needed.";

const DESCRIPTION_BY_SOURCE: Partial<Record<PlacesSource, string>> = {
  [PLACES_SOURCE.GOOGLE]:
    "Resolve a free-text query to matching places. Accepts a place name, a full address, a landmark, or a " +
    "natural-language / descriptive POI search (e.g. 'rooftop bars in Shibuya'). " +
    "Use get_place_details on a returned id for opening hours, contact info, and other attributes.",
  [PLACES_SOURCE.OSM]:
    "Resolve a free-text query to matching places. Best results come from a precise name or full address; " +
    "descriptive or category-style queries degrade - for category discovery use search_nearby_places. " +
    "Use get_place_details on a returned id for opening hours, contact info, and other attributes.",
};

const RESULT_GUIDANCE_BY_SOURCE: Partial<Record<PlacesSource, string>> = {
  [PLACES_SOURCE.GOOGLE]:
    "Phrase queries in natural language (names, full addresses, or descriptive POI searches) for stronger matches.",
  [PLACES_SOURCE.OSM]: "Use a precise name or full address; descriptive or category queries return weak matches.",
};

function selectForSource(map: Partial<Record<PlacesSource, string>>, source: PlacesSource, fallback: string): string {
  return map[source] ?? fallback;
}

export function getGeocodePlaceToolConfig(placesManager: PlacesManager) {
  const defaultSource = placesManager.getDefaultSource();
  const description = selectForSource(DESCRIPTION_BY_SOURCE, defaultSource, NEUTRAL_DESCRIPTION);
  const resultGuidance = selectForSource(RESULT_GUIDANCE_BY_SOURCE, defaultSource, NEUTRAL_RESULT_GUIDANCE);

  const inputSchema = {
    query: z
      .string()
      .min(1)
      .describe(
        "Natural-language query: a place name, a full address, a landmark, or a descriptive / POI search " +
          "(e.g. 'rooftop bars in Shibuya')."
      ),
    city: z.string().min(1).optional().describe("City, town, or locality to disambiguate the query."),
    country: z
      .string()
      .min(1)
      .optional()
      .describe("Country name or ISO 3166-1 alpha-2 code (e.g. 'France' or 'FR') to disambiguate same-named places."),
    nearLatitude: z
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe("Optional latitude for ranking bias - prefers candidates near this point."),
    nearLongitude: z.number().min(-180).max(180).optional().describe("Optional longitude paired with nearLatitude."),
    limit: z
      .number()
      .int()
      .positive()
      .max(MAX_GEOCODE_LIMIT)
      .optional()
      .describe(`Max results to return (default ${DEFAULT_GEOCODE_LIMIT}, max ${MAX_GEOCODE_LIMIT}).`),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    if ((args.nearLatitude === undefined) !== (args.nearLongitude === undefined)) {
      return textToolResult(["nearLatitude and nearLongitude must both be provided or both omitted."], true);
    }

    const queryParts = [args.query, args.city, args.country]
      .map((part) => part?.trim())
      .filter((part): part is string => part !== undefined && part.length > 0);
    if (queryParts.length === 0) {
      return textToolResult(["query must contain non-whitespace text."], true);
    }

    const queryText = queryParts.join(", ");
    try {
      const near =
        args.nearLatitude !== undefined && args.nearLongitude !== undefined
          ? { latitude: args.nearLatitude, longitude: args.nearLongitude }
          : undefined;
      const places = await placesManager.geocode({
        text: queryText,
        near,
        limit: args.limit ?? DEFAULT_GEOCODE_LIMIT,
      });

      if (places.length === 0) {
        return textToolResult([`No places found matching "${queryText}".`, resultGuidance]);
      }

      const header = `[Geocode results: ${places.length} for "${queryText}"]`;
      const body = places.map(formatPlaceSummary).join("\n");
      return textToolResult([header, body, resultGuidance]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to geocode place.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: GEOCODE_PLACE_TOOL_NAME,
    description,
    inputSchema,
    handler,
  };

  return config;
}
