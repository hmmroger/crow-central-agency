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

/**
 * Optional bias for reverse geocoding. `CITY` makes the adapter prefer a
 * matching city-level feature when one is nearby, falling back to the closest
 * feature otherwise. Default (undefined) returns the closest feature directly.
 */
export const REVERSE_GEOCODE_PRIORITY = {
  CITY: "CITY",
} as const;

export type ReverseGeocodePriority = (typeof REVERSE_GEOCODE_PRIORITY)[keyof typeof REVERSE_GEOCODE_PRIORITY];

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
 * Travel mode for an optional routing origin. Mirrors Google Routes travelMode,
 * minus TRANSIT (out of scope for place-search routing).
 */
export const TRAVEL_MODE = {
  DRIVE: "DRIVE",
  WALK: "WALK",
  BICYCLE: "BICYCLE",
  TWO_WHEELER: "TWO_WHEELER",
} as const;

export type TravelMode = (typeof TRAVEL_MODE)[keyof typeof TRAVEL_MODE];

/**
 * Opt-in origin for attaching travel distance/duration to each result. Adapters
 * that cannot route (e.g. OSM) ignore it and return places without `routing`.
 */
export interface RoutingOrigin {
  point: LocationPoint;
  /** Adapter default: DRIVE. */
  travelMode?: TravelMode;
}

/** Per-place travel summary from a `RoutingOrigin`, when the provider supplies one. */
export interface RoutingSummary {
  travelMode: TravelMode;
  distanceMeters: number;
  durationSeconds: number;
  /** Provider-supplied "open in Maps" link, when available (Google directionsUri). */
  directionsUrl?: string;
}

/**
 * Operational state of a place when the provider reports it. Mirrors Google's
 * `businessStatus`; providers without the concept (e.g. OSM) leave it unset.
 */
export const BUSINESS_STATUS = {
  OPERATIONAL: "OPERATIONAL",
  CLOSED_TEMPORARILY: "CLOSED_TEMPORARILY",
  CLOSED_PERMANENTLY: "CLOSED_PERMANENTLY",
  FUTURE_OPENING: "FUTURE_OPENING",
} as const;

export type BusinessStatus = (typeof BUSINESS_STATUS)[keyof typeof BUSINESS_STATUS];

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
  city?: string;
  county?: string;
  state?: string;
  /** ISO 3166-1 alpha-2 when available (e.g. "FR"). Adapter best-effort. */
  country?: string;
  /** Provider map page for the place, when available (e.g. Google Maps URL). */
  mapsUrl?: string;
  /** Operational state when the provider reports it. */
  businessStatus?: BusinessStatus;
  /** Travel summary from a query's `routingOrigin`; unset when no origin was given or the adapter can't route. */
  routing?: RoutingSummary;
}

export const WEEKDAY = {
  MONDAY: "MONDAY",
  TUESDAY: "TUESDAY",
  WEDNESDAY: "WEDNESDAY",
  THURSDAY: "THURSDAY",
  FRIDAY: "FRIDAY",
  SATURDAY: "SATURDAY",
  SUNDAY: "SUNDAY",
} as const;

export type Weekday = (typeof WEEKDAY)[keyof typeof WEEKDAY];

/** `HH:mm` 24-hour, local time at the place. `close === "24:00"` means end-of-day. */
export interface OpeningHoursRange {
  open: string;
  close: string;
}

export interface DayOpeningHours {
  weekday: Weekday;
  /** Empty array = closed that weekday. */
  ranges: OpeningHoursRange[];
}

/**
 * Provider-neutral opening hours. Adapters parse their native format
 * (OSM `opening_hours` spec, Google `regularOpeningHours.periods`) into this
 * shape so callers do not need to know the source.
 *
 * `weekly` always has 7 entries in MONDAY..SUNDAY order. `description` carries
 * the raw human-readable form for bits the structured shape cannot express
 * (e.g. public holidays, seasonal schedules, "by appointment").
 */
export interface OpeningHours {
  alwaysOpen: boolean;
  weekly: DayOpeningHours[];
  description?: string;
}

/**
 * Curated provider-neutral transit vehicle types. Google reports a finer-grained
 * set (e.g. METRO_RAIL, HEAVY_RAIL, COMMUTER_TRAIN); the adapter collapses those
 * into these buckets, with `OTHER` as the fallback for anything unrecognized.
 */
export const TRANSIT_VEHICLE_TYPE = {
  AIRPLANE: "AIRPLANE",
  BUS: "BUS",
  SUBWAY: "SUBWAY",
  TRAM: "TRAM",
  MONORAIL: "MONORAIL",
  RAIL: "RAIL",
  FERRY: "FERRY",
  CABLE: "CABLE",
  GONDOLAS: "GONDOLAS",
  OTHER: "OTHER",
} as const;

export type TransitVehicleType = (typeof TRANSIT_VEHICLE_TYPE)[keyof typeof TRANSIT_VEHICLE_TYPE];

export interface TransitLine {
  name: string;
  shortName?: string;
  vehicleType: TransitVehicleType;
  operator?: string;
}

export interface TransitStationInfo {
  lines: TransitLine[];
}

export const WHEELCHAIR_ACCESS = {
  YES: "YES",
  NO: "NO",
  LIMITED: "LIMITED",
} as const;

export type WheelchairAccess = (typeof WHEELCHAIR_ACCESS)[keyof typeof WHEELCHAIR_ACCESS];

/**
 * Extended attributes resolved by `getPlaceById`. Search/reverse paths keep
 * returning the lean `Place` so list responses stay small; callers that need
 * hours/contact/description fetch details for the one they care about.
 */
export interface PlaceDetails extends Place {
  openingHours?: OpeningHours;
  phone?: string;
  website?: string;
  email?: string;
  wheelchairAccess?: WheelchairAccess;
  /** Free-text from OSM `description` or Google editorial summary. */
  description?: string;
  cuisines?: string[];
  brand?: string;
  /** Transit lines serving this station; Google-only today. */
  transit?: TransitStationInfo;
}

export interface GeocodeQuery {
  text: string;
  /** Bias result ranking toward this point when the provider supports it. */
  near?: LocationPoint;
  /** Opt-in: attach travel distance/duration from this origin to each result. */
  routingOrigin?: RoutingOrigin;
  limit?: number;
}

export interface ReverseGeocodeQuery {
  point: LocationPoint;
  priority?: ReverseGeocodePriority;
}

export interface SearchPlacesQuery {
  area: LocationArea;
  category: PlaceCategory;
  /** Opt-in: attach travel distance/duration from this origin to each result. */
  routingOrigin?: RoutingOrigin;
  limit?: number;
}

export interface PlacesSourceAdapter {
  readonly source: PlacesSource;
  geocode(query: GeocodeQuery): Promise<Place[]>;
  reverseGeocode(query: ReverseGeocodeQuery): Promise<Place | undefined>;
  searchPlaces(query: SearchPlacesQuery): Promise<Place[]>;
  /** Receives the bare provider-native id (manager strips the `${source}:` prefix). */
  getPlaceById(nativeId: string): Promise<PlaceDetails | undefined>;
}
