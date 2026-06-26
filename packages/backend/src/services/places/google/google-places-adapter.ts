import {
  PLACES_SOURCE,
  REVERSE_GEOCODE_PRIORITY,
  type GeocodeQuery,
  type Place,
  type PlaceDetails,
  type PlacesSourceAdapter,
  type ReverseGeocodeQuery,
  type SearchPlacesQuery,
} from "../places-manager.types.js";
import { ADDRESS_COMPONENT_TYPE } from "./google-address-utils.js";
import { getGoogleIncludedTypes } from "./google-place-type-mapping.js";
import { geocodingResultToPlace, googlePlaceToPlace, googlePlaceToPlaceDetails } from "./google-place-mapper.js";
import { areaToCircle } from "./google-search-area.js";
import { GooglePlacesClient } from "./google-places-client.js";
import type { GooglePlace, GooglePlacesAdapterConfig } from "./google-places-adapter.types.js";

/** Cached raw place. `hasDetails` marks an entry filled by a Place Details (Enterprise) fetch. */
interface CachedGooglePlace {
  place: GooglePlace;
  hasDetails: boolean;
}

/** Id-keyed place cache bound; mirrors the OSM reverse-cache (delete-oldest, no TTL). */
const DETAILS_CACHE_MAX_SIZE = 256;

/**
 * Google-backed implementation of the `PlacesSourceAdapter`.
 *
 * - Forward geocode + category search + details go through the Places API (New).
 * - Reverse geocode is the only path on the Geocoding API (v4).
 * Native ids are Google place ids; the manager-facing id is `GOOGLE:${placeId}`.
 */
export class GooglePlacesAdapter implements PlacesSourceAdapter {
  public readonly source = PLACES_SOURCE.GOOGLE;

  private readonly client: GooglePlacesClient;
  private readonly placeCache = new Map<string, CachedGooglePlace>();
  private readonly inflightDetails = new Map<string, Promise<PlaceDetails | undefined>>();

  constructor(config: GooglePlacesAdapterConfig) {
    this.client = new GooglePlacesClient(config);
  }

  public async geocode(query: GeocodeQuery): Promise<Place[]> {
    const places = await this.client.searchText({
      textQuery: query.text,
      near: query.near,
      limit: query.limit,
    });
    return this.mapAndCacheBasePlaces(places);
  }

  public async reverseGeocode(query: ReverseGeocodeQuery): Promise<Place | undefined> {
    const results = await this.client.reverseGeocode(query.point);
    if (results.length === 0) {
      return undefined;
    }

    const preferLocality = query.priority === REVERSE_GEOCODE_PRIORITY.CITY;
    const selected =
      (preferLocality && results.find((result) => result.types.includes(ADDRESS_COMPONENT_TYPE.LOCALITY))) ||
      results[0];
    return geocodingResultToPlace(selected);
  }

  public async searchPlaces(query: SearchPlacesQuery): Promise<Place[]> {
    const includedTypes = getGoogleIncludedTypes(query.category);
    if (includedTypes.length === 0) {
      return [];
    }

    const circle = areaToCircle(query.area);
    const places = await this.client.searchNearby({
      center: circle.center,
      radiusMeters: circle.radiusMeters,
      includedTypes: [...includedTypes],
      limit: query.limit,
    });
    return this.mapAndCacheBasePlaces(places);
  }

  public getPlaceById(nativeId: string): Promise<PlaceDetails | undefined> {
    const cached = this.placeCache.get(nativeId);
    if (cached?.hasDetails) {
      return Promise.resolve(googlePlaceToPlaceDetails(cached.place));
    }

    const inflight = this.inflightDetails.get(nativeId);
    if (inflight) {
      return inflight;
    }

    const fetchPromise = this.fetchPlaceDetails(nativeId).finally(() => {
      this.inflightDetails.delete(nativeId);
    });
    this.inflightDetails.set(nativeId, fetchPromise);
    return fetchPromise;
  }

  private async fetchPlaceDetails(nativeId: string): Promise<PlaceDetails | undefined> {
    const place = await this.client.getPlaceDetails(nativeId);
    if (!place) {
      return undefined;
    }

    this.storeCache(nativeId, { place, hasDetails: true });
    return googlePlaceToPlaceDetails(place);
  }

  /** Map search/geocode results and cache each as a base entry, never downgrading a full one. */
  private mapAndCacheBasePlaces(places: GooglePlace[]): Place[] {
    const result: Place[] = [];
    for (const place of places) {
      const mapped = googlePlaceToPlace(place);
      if (!mapped) {
        continue;
      }

      const existing = this.placeCache.get(place.id);
      if (!existing?.hasDetails) {
        this.storeCache(place.id, { place, hasDetails: false });
      }

      result.push(mapped);
    }

    return result;
  }

  private storeCache(placeId: string, entry: CachedGooglePlace): void {
    if (this.placeCache.size >= DETAILS_CACHE_MAX_SIZE && !this.placeCache.has(placeId)) {
      const oldestKey = this.placeCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.placeCache.delete(oldestKey);
      }
    }

    this.placeCache.set(placeId, entry);
  }
}
