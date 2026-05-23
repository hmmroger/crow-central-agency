import { z } from "zod";
import type { PlacesManager } from "../../services/places/places-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatPlaceSummary } from "./places-format-utils.js";

const DEFAULT_GEOCODE_LIMIT = 10;
const MAX_GEOCODE_LIMIT = 25;

export const GEOCODE_PLACE_TOOL_NAME = "geocode_place";

export function getGeocodePlaceToolConfig(placesManager: PlacesManager) {
  const inputSchema = {
    name: z.string().min(1).optional().describe("Proper-noun name of a specific place or business."),
    street: z.string().min(1).optional().describe("Street address, including house number when known."),
    city: z.string().min(1).optional().describe("City, town, or locality. Example: 'London', 'Paris'."),
    postcode: z.string().min(1).optional().describe("Postal / ZIP code."),
    country: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Country name or ISO 3166-1 alpha-2 code (e.g. 'France' or 'FR'). Use to disambiguate same-named places across countries."
      ),
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
    const queryParts = [args.name, args.street, args.city, args.postcode, args.country]
      .map((part) => part?.trim())
      .filter((part): part is string => part !== undefined && part.length > 0);
    if (queryParts.length === 0) {
      return textToolResult(["At least one of name, street, city, postcode, or country must be provided."], true);
    }

    if ((args.nearLatitude === undefined) !== (args.nearLongitude === undefined)) {
      return textToolResult(["nearLatitude and nearLongitude must both be provided or both omitted."], true);
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
        return textToolResult([`No places found matching "${queryText}".`]);
      }

      const header = `[Geocode results: ${places.length} for "${queryText}"]`;
      const body = places.map(formatPlaceSummary).join("\n");
      return textToolResult([header, body]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to geocode place.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: GEOCODE_PLACE_TOOL_NAME,
    description: [
      "Resolve a known place to coordinates: a named landmark, business, or specific street address. ",
      "Provide whichever structured fields you have - the more you fill, the more precise the match. ",
      "Not a discovery tool: for 'cafes near me', 'good restaurants', or any category / subjective query, use search_nearby_places instead. ",
      "Use get_place_details on a returned id for opening hours, contact info, and other attributes.",
    ].join(""),
    inputSchema,
    handler,
  };

  return config;
}
