import z from "zod";
import type { LocationPoint } from "../places-manager.types.js";

export interface GooglePlacesAdapterConfig {
  apiKey: string;
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

const GoogleTransitLineSchema = z.object({
  displayName: GoogleLocalizedTextSchema.optional(),
  shortDisplayName: GoogleLocalizedTextSchema.optional(),
  vehicleType: z.string().optional(),
});

const GoogleTransitAgencySchema = z.object({
  displayName: GoogleLocalizedTextSchema.optional(),
  lines: z.array(GoogleTransitLineSchema).optional(),
});

const GoogleTransitStationSchema = z.object({
  agencies: z.array(GoogleTransitAgencySchema).optional(),
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
  googleMapsUri: z.string().optional(),
  businessStatus: z.string().optional(),
  regularOpeningHours: GoogleRegularOpeningHoursSchema.optional(),
  internationalPhoneNumber: z.string().optional(),
  websiteUri: z.string().optional(),
  accessibilityOptions: GoogleAccessibilityOptionsSchema.optional(),
  transitStation: GoogleTransitStationSchema.optional(),
});

export type GooglePlace = z.infer<typeof GooglePlaceSchema>;
export type GoogleAddressComponent = z.infer<typeof GoogleAddressComponentSchema>;
export type GoogleRegularOpeningHours = z.infer<typeof GoogleRegularOpeningHoursSchema>;

export const GooglePlacesSearchResponseSchema = z.object({
  places: z.array(GooglePlaceSchema).optional(),
});

/**
 * Geocoding API (v4) result. v4 shares the Places API (New) lat/lng, viewport
 * (low/high), and address-component (longText/shortText) shapes, so the same
 * schemas are reused here instead of the snake_case v3 equivalents.
 */
export const GoogleGeocodingResultSchema = z.object({
  placeId: z.string(),
  formattedAddress: z.string().optional(),
  addressComponents: z.array(GoogleAddressComponentSchema).optional(),
  location: GoogleLatLngSchema,
  viewport: GoogleViewportSchema.optional(),
  bounds: GoogleViewportSchema.optional(),
  types: z.array(z.string()),
});

export type GoogleGeocodingResult = z.infer<typeof GoogleGeocodingResultSchema>;

/** Geocoding API (v4) reverse-geocode response: results only; errors surface via HTTP status. */
export const GoogleGeocodingResponseSchema = z.object({
  results: z.array(GoogleGeocodingResultSchema).optional(),
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
