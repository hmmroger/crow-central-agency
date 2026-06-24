import z from "zod";
import type { LocationPoint } from "../places-manager.types.js";

export interface GooglePlacesAdapterConfig {
  apiKey: string;
  /** Places API (New) base, e.g. https://places.googleapis.com/v1 */
  placesBaseUrl: string;
  /** Geocoding API endpoint, e.g. https://maps.googleapis.com/maps/api/geocode/json */
  geocodingUrl: string;
}

const GoogleLatLngSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

/** Places API (New) viewport: low = south-west corner, high = north-east corner. */
const GoogleViewportSchema = z.object({
  low: GoogleLatLngSchema,
  high: GoogleLatLngSchema,
});

const GoogleLocalizedTextSchema = z.object({
  text: z.string(),
  languageCode: z.string().optional(),
});

const GoogleAddressComponentSchema = z.object({
  longText: z.string().optional(),
  shortText: z.string().optional(),
  types: z.array(z.string()),
  languageCode: z.string().optional(),
});

/** A point in `regularOpeningHours.periods`. `day` is 0=Sunday .. 6=Saturday. */
const GoogleOpeningHoursPointSchema = z.object({
  day: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

const GoogleOpeningPeriodSchema = z.object({
  open: GoogleOpeningHoursPointSchema,
  /** Absent for a period that is open continuously (24/7 when open is day 0 / 00:00). */
  close: GoogleOpeningHoursPointSchema.optional(),
});

const GoogleRegularOpeningHoursSchema = z.object({
  openNow: z.boolean().optional(),
  periods: z.array(GoogleOpeningPeriodSchema).optional(),
  weekdayDescriptions: z.array(z.string()).optional(),
});

const GoogleAccessibilityOptionsSchema = z.object({
  wheelchairAccessibleEntrance: z.boolean().optional(),
  wheelchairAccessibleParking: z.boolean().optional(),
  wheelchairAccessibleRestroom: z.boolean().optional(),
  wheelchairAccessibleSeating: z.boolean().optional(),
});

export const GooglePlaceSchema = z.object({
  id: z.string(),
  displayName: GoogleLocalizedTextSchema.optional(),
  location: GoogleLatLngSchema.optional(),
  formattedAddress: z.string().optional(),
  addressComponents: z.array(GoogleAddressComponentSchema).optional(),
  primaryType: z.string().optional(),
  types: z.array(z.string()).optional(),
  viewport: GoogleViewportSchema.optional(),
  regularOpeningHours: GoogleRegularOpeningHoursSchema.optional(),
  internationalPhoneNumber: z.string().optional(),
  websiteUri: z.string().optional(),
  editorialSummary: GoogleLocalizedTextSchema.optional(),
  accessibilityOptions: GoogleAccessibilityOptionsSchema.optional(),
});

export type GooglePlace = z.infer<typeof GooglePlaceSchema>;
export type GoogleAddressComponent = z.infer<typeof GoogleAddressComponentSchema>;
export type GoogleRegularOpeningHours = z.infer<typeof GoogleRegularOpeningHoursSchema>;

export const GooglePlacesSearchResponseSchema = z.object({
  places: z.array(GooglePlaceSchema).optional(),
});

const GoogleGeocodingLatLngSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

const GoogleGeocodingAddressComponentSchema = z.object({
  long_name: z.string(),
  short_name: z.string(),
  types: z.array(z.string()),
});

const GoogleGeocodingGeometrySchema = z.object({
  location: GoogleGeocodingLatLngSchema,
  bounds: z
    .object({
      northeast: GoogleGeocodingLatLngSchema,
      southwest: GoogleGeocodingLatLngSchema,
    })
    .optional(),
  viewport: z
    .object({
      northeast: GoogleGeocodingLatLngSchema,
      southwest: GoogleGeocodingLatLngSchema,
    })
    .optional(),
});

export const GoogleGeocodingResultSchema = z.object({
  place_id: z.string(),
  formatted_address: z.string().optional(),
  address_components: z.array(GoogleGeocodingAddressComponentSchema),
  geometry: GoogleGeocodingGeometrySchema,
  types: z.array(z.string()),
});

export type GoogleGeocodingResult = z.infer<typeof GoogleGeocodingResultSchema>;

export const GoogleGeocodingResponseSchema = z.object({
  status: z.string(),
  results: z.array(GoogleGeocodingResultSchema),
  error_message: z.string().optional(),
});

export interface GoogleSearchTextRequest {
  textQuery: string;
  /** Soft ranking bias toward this point (locationBias circle). */
  near?: LocationPoint;
  limit?: number;
}

export interface GoogleSearchNearbyRequest {
  center: LocationPoint;
  radiusMeters: number;
  includedTypes: string[];
  limit?: number;
}
