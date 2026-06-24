import {
  PLACES_SOURCE,
  REVERSE_GEOCODE_PRIORITY,
  WHEELCHAIR_ACCESS,
  type GeocodeQuery,
  type LocationArea,
  type LocationBoundingBox,
  type LocationPoint,
  type Place,
  type PlaceDetails,
  type PlacesSourceAdapter,
  type ReverseGeocodeQuery,
  type SearchPlacesQuery,
  type WheelchairAccess,
} from "../places-manager.types.js";
import { categoryFromGoogleTypes, getGoogleIncludedTypes } from "./google-place-type-mapping.js";
import { parseGoogleOpeningHours } from "./google-opening-hours-parser.js";
import { GooglePlacesClient } from "./google-places-client.js";
import type {
  GoogleAddressComponent,
  GoogleGeocodingResult,
  GooglePlace,
  GooglePlacesAdapterConfig,
} from "./google-places-adapter.types.js";

/** Places API (New) searchNearby caps the locationRestriction radius at 50 km. */
const MAX_SEARCH_RADIUS_METERS = 50_000;
const EARTH_RADIUS_METERS = 6_371_000;
const LOCALITY_TYPE = "locality";

/** A normalized address component bridging Places-New and Geocoding shapes. */
interface NormalizedAddressComponent {
  types: readonly string[];
  long?: string;
  short?: string;
}

interface ResolvedAdminParts {
  city?: string;
  county?: string;
  state?: string;
  countryCode?: string;
}

/**
 * Google-backed implementation of the `PlacesSourceAdapter`.
 *
 * - Forward geocode + category search + details go through the Places API (New).
 * - Reverse geocode is the only path on the classic Geocoding API.
 * Native ids are Google place ids; the manager-facing id is `GOOGLE:${placeId}`.
 */
export class GooglePlacesAdapter implements PlacesSourceAdapter {
  public readonly source = PLACES_SOURCE.GOOGLE;

  private readonly client: GooglePlacesClient;

  constructor(config: GooglePlacesAdapterConfig) {
    this.client = new GooglePlacesClient(config);
  }

  public async geocode(query: GeocodeQuery): Promise<Place[]> {
    const places = await this.client.searchText({
      textQuery: query.text,
      near: query.near,
      limit: query.limit,
    });
    return places.flatMap((place) => {
      const mapped = googlePlaceToPlace(place);
      return mapped ? [mapped] : [];
    });
  }

  public async reverseGeocode(query: ReverseGeocodeQuery): Promise<Place | undefined> {
    const results = await this.client.reverseGeocode(query.point);
    if (results.length === 0) {
      return undefined;
    }

    const preferLocality = query.priority === REVERSE_GEOCODE_PRIORITY.CITY;
    const selected = (preferLocality && results.find((result) => result.types.includes(LOCALITY_TYPE))) || results[0];
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
    return places.flatMap((place) => {
      const mapped = googlePlaceToPlace(place);
      return mapped ? [mapped] : [];
    });
  }

  public async getPlaceById(nativeId: string): Promise<PlaceDetails | undefined> {
    const place = await this.client.getPlaceDetails(nativeId);
    if (!place) {
      return undefined;
    }

    return googlePlaceToPlaceDetails(place);
  }
}

function googlePlaceToPlace(place: GooglePlace): Place | undefined {
  if (!place.location) {
    return undefined;
  }

  const adminParts = readAdminParts(place.addressComponents?.map(normalizePlaceComponent));
  const result: Place = {
    id: `${PLACES_SOURCE.GOOGLE}:${place.id}`,
    source: PLACES_SOURCE.GOOGLE,
    displayName: place.displayName?.text ?? place.id,
    category: categoryFromGoogleTypes(place.primaryType, place.types),
    location: { latitude: place.location.latitude, longitude: place.location.longitude },
  };

  applyAdminParts(result, adminParts);

  if (place.formattedAddress) {
    result.address = place.formattedAddress;
  }

  if (place.viewport) {
    result.boundingBox = {
      south: place.viewport.low.latitude,
      west: place.viewport.low.longitude,
      north: place.viewport.high.latitude,
      east: place.viewport.high.longitude,
    };
  }

  return result;
}

function googlePlaceToPlaceDetails(place: GooglePlace): PlaceDetails | undefined {
  const base = googlePlaceToPlace(place);
  if (!base) {
    return undefined;
  }

  const details: PlaceDetails = { ...base };

  const openingHours = parseGoogleOpeningHours(place.regularOpeningHours);
  if (openingHours) {
    details.openingHours = openingHours;
  }

  if (place.internationalPhoneNumber) {
    details.phone = place.internationalPhoneNumber;
  }

  if (place.websiteUri) {
    details.website = place.websiteUri;
  }

  const wheelchairAccess = readWheelchairAccess(place);
  if (wheelchairAccess) {
    details.wheelchairAccess = wheelchairAccess;
  }

  const description = place.editorialSummary?.text?.trim();
  if (description) {
    details.description = description;
  }

  return details;
}

function geocodingResultToPlace(result: GoogleGeocodingResult): Place {
  const adminParts = readAdminParts(result.address_components.map(normalizeGeocodingComponent));
  const isLocality = result.types.includes(LOCALITY_TYPE);
  const displayName = (isLocality ? adminParts.city : undefined) ?? result.formatted_address ?? result.place_id;

  const place: Place = {
    id: `${PLACES_SOURCE.GOOGLE}:${result.place_id}`,
    source: PLACES_SOURCE.GOOGLE,
    displayName,
    category: categoryFromGoogleTypes(undefined, result.types),
    location: { latitude: result.geometry.location.lat, longitude: result.geometry.location.lng },
  };

  applyAdminParts(place, adminParts);

  if (result.formatted_address) {
    place.address = result.formatted_address;
  }

  const boundingBox = geocodingBoundingBox(result);
  if (boundingBox) {
    place.boundingBox = boundingBox;
  }

  return place;
}

function normalizePlaceComponent(component: GoogleAddressComponent): NormalizedAddressComponent {
  return { types: component.types, long: component.longText, short: component.shortText };
}

function normalizeGeocodingComponent(component: {
  long_name: string;
  short_name: string;
  types: string[];
}): NormalizedAddressComponent {
  return { types: component.types, long: component.long_name, short: component.short_name };
}

function readAdminParts(components: NormalizedAddressComponent[] | undefined): ResolvedAdminParts {
  if (!components) {
    return {};
  }

  return {
    city: findComponentLong(components, "locality"),
    county: findComponentLong(components, "administrative_area_level_2"),
    state: findComponentLong(components, "administrative_area_level_1"),
    countryCode: normalizeCountryCode(findComponentShort(components, "country")),
  };
}

function findComponentLong(components: NormalizedAddressComponent[], type: string): string | undefined {
  return components.find((component) => component.types.includes(type))?.long;
}

function findComponentShort(components: NormalizedAddressComponent[], type: string): string | undefined {
  return components.find((component) => component.types.includes(type))?.short;
}

function applyAdminParts(place: Place, adminParts: ResolvedAdminParts): void {
  if (adminParts.city) {
    place.city = adminParts.city;
  }

  if (adminParts.county) {
    place.county = adminParts.county;
  }

  if (adminParts.state) {
    place.state = adminParts.state;
  }

  if (adminParts.countryCode) {
    place.country = adminParts.countryCode;
  }
}

function readWheelchairAccess(place: GooglePlace): WheelchairAccess | undefined {
  const entrance = place.accessibilityOptions?.wheelchairAccessibleEntrance;
  if (entrance === undefined) {
    return undefined;
  }

  return entrance ? WHEELCHAIR_ACCESS.YES : WHEELCHAIR_ACCESS.NO;
}

function normalizeCountryCode(code: string | undefined): string | undefined {
  if (!code) {
    return undefined;
  }

  const trimmed = code.trim();
  if (trimmed.length !== 2) {
    return undefined;
  }

  return trimmed.toUpperCase();
}

/** Convert a search area into the circle Google's searchNearby accepts (radius clamped). */
function areaToCircle(area: LocationArea): { center: LocationPoint; radiusMeters: number } {
  if (area.type === "radius") {
    return { center: area.center, radiusMeters: clampRadius(area.radiusMeters) };
  }

  const { south, west, north, east } = area.boundingBox;
  const center: LocationPoint = { latitude: (south + north) / 2, longitude: (west + east) / 2 };
  const circumscribingRadius = haversineMeters(center, { latitude: north, longitude: east });
  return { center, radiusMeters: clampRadius(circumscribingRadius) };
}

function clampRadius(radiusMeters: number): number {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    return MAX_SEARCH_RADIUS_METERS;
  }

  return Math.min(radiusMeters, MAX_SEARCH_RADIUS_METERS);
}

function haversineMeters(from: LocationPoint, to: LocationPoint): number {
  const fromLatRad = toRadians(from.latitude);
  const toLatRad = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(fromLatRad) * Math.cos(toLatRad) * Math.sin(deltaLon / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function geocodingBoundingBox(result: GoogleGeocodingResult): LocationBoundingBox | undefined {
  const box = result.geometry.bounds ?? result.geometry.viewport;
  if (!box) {
    return undefined;
  }

  return {
    south: box.southwest.lat,
    west: box.southwest.lng,
    north: box.northeast.lat,
    east: box.northeast.lng,
  };
}
