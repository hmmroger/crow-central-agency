import { z } from "zod";
import {
  PLACES_SOURCE,
  TRAVEL_MODE,
  type PlacesSource,
  type RoutingOrigin,
  type TravelMode,
} from "../../services/places/places-manager.types.js";

const TRAVEL_MODE_VALUES = Object.values(TRAVEL_MODE) as [TravelMode, ...TravelMode[]];

/** Optional routing-origin inputs shared by the place search and geocode tools. */
export const routingOriginInputSchema = {
  originLatitude: z
    .number()
    .min(-90)
    .max(90)
    .optional()
    .describe("Latitude of the travel origin; pair with originLongitude to attach travel time and distance."),
  originLongitude: z
    .number()
    .min(-180)
    .max(180)
    .optional()
    .describe("Longitude of the travel origin; must be paired with originLatitude."),
  travelMode: z
    .enum(TRAVEL_MODE_VALUES)
    .optional()
    .describe("Travel mode for the origin (default DRIVE). Ignored unless an origin is provided."),
};

interface RoutingOriginArgs {
  originLatitude?: number;
  originLongitude?: number;
  travelMode?: TravelMode;
}

export type RoutingOriginResolution = { error: string } | { routingOrigin: RoutingOrigin | undefined };

/**
 * Validate the both-or-neither origin pair and build a `RoutingOrigin`. A
 * `travelMode` without an origin is a no-op rather than an error.
 */
export function resolveRoutingOrigin(args: RoutingOriginArgs): RoutingOriginResolution {
  const { originLatitude, originLongitude, travelMode } = args;
  if ((originLatitude === undefined) !== (originLongitude === undefined)) {
    return { error: "originLatitude and originLongitude must both be provided or both omitted." };
  }

  if (originLatitude === undefined || originLongitude === undefined) {
    return { routingOrigin: undefined };
  }

  const routingOrigin: RoutingOrigin = { point: { latitude: originLatitude, longitude: originLongitude } };
  if (travelMode) {
    routingOrigin.travelMode = travelMode;
  }

  return { routingOrigin };
}

const ROUTING_DESCRIPTION_BY_SOURCE: Partial<Record<PlacesSource, string>> = {
  [PLACES_SOURCE.GOOGLE]: "Provide originLatitude/originLongitude to attach travel time and distance to each result.",
  [PLACES_SOURCE.OSM]: "Travel time and distance to results are not available on this source.",
};

/** One-line, source-aware note about routing support for a tool description. */
export function routingDescriptionLine(source: PlacesSource): string | undefined {
  return ROUTING_DESCRIPTION_BY_SOURCE[source];
}
