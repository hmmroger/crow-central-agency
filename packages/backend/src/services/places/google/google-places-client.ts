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
import { clampResultCount, readGoogleErrorMessage, toLatLng } from "./google-request-utils.js";

const GOOGLE_PLACES_SERVICE_NAME = "GooglePlacesAPI";
const GOOGLE_GEOCODING_SERVICE_NAME = "GoogleGeocodingAPI";
const GOOGLE_REQUEST_TIMEOUT_MS = 5_000;
const GOOGLE_USER_AGENT = "CrowCentralAgency/1.0";

const GOOGLE_PLACES_BASE_URL = "https://places.googleapis.com/v1";
const GOOGLE_GEOCODING_BASE_URL = "https://geocode.googleapis.com/v4/geocode";

/** Soft locationBias circle radius (meters) applied to free-text geocode. */
const GEOCODE_BIAS_RADIUS_METERS = 50_000;

/**
 * Place fields grouped by Google SKU tier.
 */
const ESSENTIALS_IDS_ONLY_FIELDS = ["id"] as const;
const PRO_FIELDS = [
  "location",
  "addressComponents",
  "types",
  "viewport",
  "displayName",
  "formattedAddress",
  "primaryType",
  "accessibilityOptions",
  "googleMapsUri",
  "businessStatus",
  "subDestinations",
] as const;
const ENTERPRISE_FIELDS = [
  "regularOpeningHours",
  "internationalPhoneNumber",
  "websiteUri",
  "transitStation.agencies",
] as const;

/** Search + geocode requests: every <= Pro field, billed Pro (displayName is Pro). */
const BASE_PLACE_FIELDS = [...ESSENTIALS_IDS_ONLY_FIELDS, ...PRO_FIELDS];
/** Place Details requests: base plus Enterprise contact/hours fields, billed Enterprise. */
const DETAILS_PLACE_FIELDS = [...BASE_PLACE_FIELDS, ...ENTERPRISE_FIELDS];

/**
 * Search/geocode responses wrap results in `places[]`, so the field mask must
 * prefix each field with `places.`. The single-place details endpoint returns a
 * bare Place resource and uses the field names directly.
 */
const SEARCH_FIELD_MASK = BASE_PLACE_FIELDS.map((field) => `places.${field}`).join(",");
const DETAILS_FIELD_MASK = DETAILS_PLACE_FIELDS.join(",");

/**
 * Single HTTP client for both Google APIs the adapter needs: Places API (New)
 * for search/details and the Geocoding API for reverse geocoding.
 */
export class GooglePlacesClient {
  private readonly apiKey: string;

  constructor(config: GooglePlacesAdapterConfig) {
    this.apiKey = config.apiKey;
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
    return this.geocodingRequest(point);
  }

  private async placesRequest<TSchema extends z.ZodTypeAny>(
    path: string,
    fieldMask: string,
    schema: TSchema,
    body?: unknown
  ): Promise<z.infer<TSchema>> {
    const url = `${GOOGLE_PLACES_BASE_URL}${path}`;
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
      const apiMessage = await readGoogleErrorMessage(response);
      throw new RequestError(
        `Google Places request failed: HTTP ${response.status}${apiMessage ? ` (${apiMessage})` : ""}`,
        response.status,
        undefined,
        GOOGLE_PLACES_SERVICE_NAME
      );
    }

    const json = await response.json();
    return schema.parse(json);
  }

  private async geocodingRequest(point: LocationPoint): Promise<GoogleGeocodingResult[]> {
    const url = `${GOOGLE_GEOCODING_BASE_URL}/location/${point.latitude},${point.longitude}`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": GOOGLE_USER_AGENT,
          "X-Goog-Api-Key": this.apiKey,
        },
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
      const apiMessage = await readGoogleErrorMessage(response);
      throw new RequestError(
        `Google Geocoding request failed: HTTP ${response.status}${apiMessage ? ` (${apiMessage})` : ""}`,
        response.status,
        undefined,
        GOOGLE_GEOCODING_SERVICE_NAME
      );
    }

    const json = await response.json();
    return GoogleGeocodingResponseSchema.parse(json).results ?? [];
  }
}
