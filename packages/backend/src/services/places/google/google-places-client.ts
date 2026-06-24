import type z from "zod";
import { RequestError } from "../../../core/error/request-error.js";
import type { LocationPoint } from "../places-manager.types.js";
import {
  GoogleGeocodingResponseSchema,
  GooglePlaceSchema,
  GooglePlacesSearchResponseSchema,
  type GooglePlace,
  type GooglePlacesAdapterConfig,
  type GoogleGeocodingResult,
  type GoogleSearchNearbyRequest,
  type GoogleSearchTextRequest,
} from "./google-places-adapter.types.js";

const GOOGLE_PLACES_SERVICE_NAME = "GooglePlacesAPI";
const GOOGLE_GEOCODING_SERVICE_NAME = "GoogleGeocodingAPI";
const GOOGLE_REQUEST_TIMEOUT_MS = 5_000;
const GOOGLE_USER_AGENT = "CrowCentralAgency/1.0";

/** Places API (New) caps maxResultCount at 20 for both searchText and searchNearby. */
const MAX_RESULT_COUNT = 20;
/** Soft locationBias circle radius (meters) applied to free-text geocode. */
const GEOCODE_BIAS_RADIUS_METERS = 50_000;

/** Geocoding API status values that are non-errors (no match found). */
const GEOCODING_EMPTY_STATUSES: ReadonlySet<string> = new Set(["ZERO_RESULTS"]);
const GEOCODING_OK_STATUS = "OK";

/** Place fields requested for search + geocode results (Basic tier, lean). */
const BASE_PLACE_FIELDS = [
  "id",
  "displayName",
  "location",
  "formattedAddress",
  "addressComponents",
  "primaryType",
  "types",
  "viewport",
] as const;

/** Additional fields requested only for details lookups. */
const DETAIL_PLACE_FIELDS = [
  "regularOpeningHours",
  "internationalPhoneNumber",
  "websiteUri",
  "editorialSummary",
  "accessibilityOptions",
] as const;

/**
 * Search/geocode responses wrap results in `places[]`, so the field mask must
 * prefix each field with `places.`. The single-place details endpoint returns a
 * bare Place resource and uses the field names directly.
 */
const SEARCH_FIELD_MASK = BASE_PLACE_FIELDS.map((field) => `places.${field}`).join(",");
const DETAILS_FIELD_MASK = [...BASE_PLACE_FIELDS, ...DETAIL_PLACE_FIELDS].join(",");

/**
 * Single HTTP client for both Google APIs the adapter needs: Places API (New)
 * for search/details and the Geocoding API for reverse geocoding. They share
 * one provider, key, and billing account but differ in host, auth, and response
 * shape, so the divergence is contained in two private request helpers.
 * Docs: https://developers.google.com/maps/documentation/places/web-service
 */
export class GooglePlacesClient {
  private readonly apiKey: string;
  private readonly placesBaseUrl: string;
  private readonly geocodingUrl: string;

  constructor(config: GooglePlacesAdapterConfig) {
    this.apiKey = config.apiKey;
    this.placesBaseUrl = config.placesBaseUrl;
    this.geocodingUrl = config.geocodingUrl;
  }

  public async searchText(request: GoogleSearchTextRequest): Promise<GooglePlace[]> {
    const body: Record<string, unknown> = {
      textQuery: request.textQuery,
      maxResultCount: clampResultCount(request.limit),
    };
    if (request.near) {
      body.locationBias = { circle: { center: toLatLng(request.near), radius: GEOCODE_BIAS_RADIUS_METERS } };
    }

    const response = await this.placesRequest(
      "/places:searchText",
      SEARCH_FIELD_MASK,
      GooglePlacesSearchResponseSchema,
      body
    );
    return response.places ?? [];
  }

  public async searchNearby(request: GoogleSearchNearbyRequest): Promise<GooglePlace[]> {
    const body = {
      includedTypes: request.includedTypes,
      maxResultCount: clampResultCount(request.limit),
      locationRestriction: { circle: { center: toLatLng(request.center), radius: request.radiusMeters } },
    };

    const response = await this.placesRequest(
      "/places:searchNearby",
      SEARCH_FIELD_MASK,
      GooglePlacesSearchResponseSchema,
      body
    );
    return response.places ?? [];
  }

  /** Returns undefined when Google reports the place id as not found (HTTP 404). */
  public async getPlaceDetails(placeId: string): Promise<GooglePlace | undefined> {
    try {
      return await this.placesRequest(`/places/${encodeURIComponent(placeId)}`, DETAILS_FIELD_MASK, GooglePlaceSchema);
    } catch (error) {
      if (error instanceof RequestError && error.statusCode === 404) {
        return undefined;
      }

      throw error;
    }
  }

  public async reverseGeocode(point: LocationPoint): Promise<GoogleGeocodingResult[]> {
    const params = new URLSearchParams({
      latlng: `${point.latitude},${point.longitude}`,
      key: this.apiKey,
    });
    return this.geocodingRequest(params);
  }

  private async placesRequest<TSchema extends z.ZodTypeAny>(
    path: string,
    fieldMask: string,
    schema: TSchema,
    body?: unknown
  ): Promise<z.infer<TSchema>> {
    const url = `${this.placesBaseUrl}${path}`;
    const headers: Record<string, string> = {
      "User-Agent": GOOGLE_USER_AGENT,
      "X-Goog-Api-Key": this.apiKey,
      "X-Goog-FieldMask": fieldMask,
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: body !== undefined ? "POST" : "GET",
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new RequestError(
        "Google Places request failed (network)",
        undefined,
        undefined,
        GOOGLE_PLACES_SERVICE_NAME,
        { cause: error }
      );
    }

    if (!response.ok) {
      throw new RequestError(
        `Google Places request failed: HTTP ${response.status}`,
        response.status,
        undefined,
        GOOGLE_PLACES_SERVICE_NAME
      );
    }

    const json = await response.json();
    return schema.parse(json);
  }

  private async geocodingRequest(params: URLSearchParams): Promise<GoogleGeocodingResult[]> {
    const url = `${this.geocodingUrl}?${params.toString()}`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": GOOGLE_USER_AGENT },
        signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new RequestError(
        "Google Geocoding request failed (network)",
        undefined,
        undefined,
        GOOGLE_GEOCODING_SERVICE_NAME,
        { cause: error }
      );
    }

    if (!response.ok) {
      throw new RequestError(
        `Google Geocoding request failed: HTTP ${response.status}`,
        response.status,
        undefined,
        GOOGLE_GEOCODING_SERVICE_NAME
      );
    }

    const json = await response.json();
    const parsed = GoogleGeocodingResponseSchema.parse(json);
    if (GEOCODING_EMPTY_STATUSES.has(parsed.status)) {
      return [];
    }

    if (parsed.status !== GEOCODING_OK_STATUS) {
      throw new RequestError(
        `Google Geocoding request failed: ${parsed.status}${parsed.error_message ? ` (${parsed.error_message})` : ""}`,
        response.status,
        parsed.status,
        GOOGLE_GEOCODING_SERVICE_NAME
      );
    }

    return parsed.results;
  }
}

function clampResultCount(limit: number | undefined): number {
  if (limit === undefined) {
    return MAX_RESULT_COUNT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_RESULT_COUNT);
}

function toLatLng(point: LocationPoint): { latitude: number; longitude: number } {
  return { latitude: point.latitude, longitude: point.longitude };
}
