export const PLACES_SOURCE = {
  OSM: "OSM",
  GOOGLE: "GOOGLE",
} as const;

export type PlacesSource = (typeof PLACES_SOURCE)[keyof typeof PLACES_SOURCE];

/**
 * Curated provider-neutral place categories. Each adapter maps to/from its
 * native taxonomy (OSM tags, Google place types). Unrecognized provider tags
 * surface as `OTHER` rather than failing the lookup.
 */
export const PLACE_CATEGORY = {
  CAFE: "CAFE",
  RESTAURANT: "RESTAURANT",
  BAR: "BAR",
  HOTEL: "HOTEL",
  PARK: "PARK",
  MUSEUM: "MUSEUM",
  ATTRACTION: "ATTRACTION",
  SHOP: "SHOP",
  SUPERMARKET: "SUPERMARKET",
  PHARMACY: "PHARMACY",
  HOSPITAL: "HOSPITAL",
  PARKING: "PARKING",
  TRANSIT_STATION: "TRANSIT_STATION",
  GAS_STATION: "GAS_STATION",
  OTHER: "OTHER",
} as const;

export type PlaceCategory = (typeof PLACE_CATEGORY)[keyof typeof PLACE_CATEGORY];

export interface LocationPoint {
  latitude: number;
  longitude: number;
}

export interface LocationBoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Search-area input. Discriminated to prevent passing both radius and bbox. */
export type LocationArea =
  | { type: "radius"; center: LocationPoint; radiusMeters: number }
  | { type: "boundingBox"; boundingBox: LocationBoundingBox };

/**
 * A resolved place. `id` is prefixed with its source so the manager can dispatch
 * id-based lookups across providers: `${source}:${nativeId}` (e.g. `OSM:node/12345`).
 */
export interface Place {
  id: string;
  source: PlacesSource;
  displayName: string;
  category: PlaceCategory;
  location: LocationPoint;
  boundingBox?: LocationBoundingBox;
  /** Single-line formatted address from the provider. */
  address?: string;
  /** ISO 3166-1 alpha-2 when available (e.g. "FR"). Adapter best-effort. */
  country?: string;
}

export interface GeocodeQuery {
  text: string;
  /** Bias result ranking toward this point when the provider supports it. */
  near?: LocationPoint;
  limit?: number;
}

export interface ReverseGeocodeQuery {
  point: LocationPoint;
}

export interface SearchPlacesQuery {
  area: LocationArea;
  category: PlaceCategory;
  limit?: number;
}

export interface PlacesSourceAdapter {
  readonly source: PlacesSource;
  geocode(query: GeocodeQuery): Promise<Place[]>;
  reverseGeocode(query: ReverseGeocodeQuery): Promise<Place | undefined>;
  searchPlaces(query: SearchPlacesQuery): Promise<Place[]>;
  /** Receives the bare provider-native id (manager strips the `${source}:` prefix). */
  getPlaceById(nativeId: string): Promise<Place | undefined>;
}
