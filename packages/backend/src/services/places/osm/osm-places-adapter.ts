import { logger } from "../../../utils/logger.js";
import {
  PLACES_SOURCE,
  REVERSE_GEOCODE_PRIORITY,
  WHEELCHAIR_ACCESS,
  type GeocodeQuery,
  type LocationBoundingBox,
  type Place,
  type PlaceDetails,
  type PlacesSourceAdapter,
  type ReverseGeocodeQuery,
  type SearchPlacesQuery,
  type WheelchairAccess,
} from "../places-manager.types.js";
import { parseOsmOpeningHours } from "./osm-opening-hours-parser.js";
import { OSM_ELEMENT_TYPE, type OsmElementType, type OsmPlacesAdapterConfig } from "./osm-places-adapter.types.js";
import { buildOverpassByIdQuery, buildOverpassSearchQuery } from "./osm-overpass-query-builder.js";
import { OverpassClient, getOverpassElementCenter, type OverpassElement } from "./osm-overpass-client.js";
import { PhotonClient } from "./osm-photon-client.js";
import { categoryFromOsmTags } from "./osm-tag-mapping.js";
import { PHOTON_LAYER, type PhotonFeature, type PhotonOsmType } from "./osm-photon-client.types.js";

const log = logger.child({ context: "osm-places-adapter" });

const REVERSE_CACHE_MAX_SIZE = 128;
/** Decimal places used when keying the reverse-geocode cache. 6dp ≈ 11 cm precision. */
const REVERSE_CACHE_KEY_PRECISION = 6;
/** Tier-1 radius for the reverse-geocode cascade — see `fetchReverseGeocode`. */
const REVERSE_CITY_TIER_RADIUS_KM = 15;

const PHOTON_OSM_TYPE_TO_ELEMENT: Readonly<Record<PhotonOsmType, OsmElementType>> = {
  N: OSM_ELEMENT_TYPE.NODE,
  W: OSM_ELEMENT_TYPE.WAY,
  R: OSM_ELEMENT_TYPE.RELATION,
};

/**
 * OSM-backed implementation of the `PlacesSourceAdapter`.
 *
 * - Forward + reverse geocoding go through Photon.
 * - Category/POI search and id-lookup go through Overpass.
 * - Reverse-geocode results are cached in-memory and de-duplicated per
 *   coordinate (mirrors `geolocation-sensor.ts`). No persistent cache or
 *   rate-limit queueing in v1.
 */
export class OsmPlacesAdapter implements PlacesSourceAdapter {
  public readonly source = PLACES_SOURCE.OSM;

  private readonly photon: PhotonClient;
  private readonly overpass: OverpassClient;
  private readonly reverseCache = new Map<string, Place>();
  private readonly inflightReverse = new Map<string, Promise<Place | undefined>>();

  constructor(config: OsmPlacesAdapterConfig) {
    this.photon = new PhotonClient(config.photonUrl);
    this.overpass = new OverpassClient(config.overpassUrl);
  }

  public async geocode(query: GeocodeQuery): Promise<Place[]> {
    const features = await this.photon.forwardGeocode({
      text: query.text,
      near: query.near,
      limit: query.limit,
    });
    return features.map((feature) => photonFeatureToPlace(feature));
  }

  public async reverseGeocode(query: ReverseGeocodeQuery): Promise<Place | undefined> {
    const key = this.reverseCacheKey(query);
    const cached = this.reverseCache.get(key);
    if (cached) {
      return cached;
    }

    const inflight = this.inflightReverse.get(key);
    if (inflight) {
      return inflight;
    }

    const fetchPromise = this.fetchReverseGeocode(query)
      .then((place) => {
        if (place) {
          this.storeReverseCache(key, place);
        }

        return place;
      })
      .catch((error) => {
        log.warn({ error, point: query.point }, "Reverse geocode failed");
        throw error;
      })
      .finally(() => {
        this.inflightReverse.delete(key);
      });

    this.inflightReverse.set(key, fetchPromise);
    return fetchPromise;
  }

  public async searchPlaces(query: SearchPlacesQuery): Promise<Place[]> {
    const overpassQuery = buildOverpassSearchQuery(query);
    const elements = await this.overpass.run(overpassQuery);
    return elements.flatMap((element) => {
      const place = overpassElementToPlace(element);
      return place ? [place] : [];
    });
  }

  public async getPlaceById(nativeId: string): Promise<PlaceDetails | undefined> {
    const parsed = parseOsmNativeId(nativeId);
    if (!parsed) {
      return undefined;
    }

    const overpassQuery = buildOverpassByIdQuery(parsed.type, parsed.osmId);
    const elements = await this.overpass.run(overpassQuery);
    const element = elements[0];
    if (!element) {
      return undefined;
    }

    return overpassElementToPlaceDetails(element);
  }

  private async fetchReverseGeocode(query: ReverseGeocodeQuery): Promise<Place | undefined> {
    if (query.priority === REVERSE_GEOCODE_PRIORITY.CITY) {
      // Tier 1: nearest `place=city`/`town` within 15 km. Matches the agent-meaningful
      // "what city am I in" semantics; when present, the returned feature IS the city node.
      const cityHit = await this.photon.reverseGeocode({
        point: query.point,
        limit: 1,
        layers: [PHOTON_LAYER.CITY],
        radius: REVERSE_CITY_TIER_RADIUS_KM,
      });
      if (cityHit[0]) {
        return photonFeatureToPlace(cityHit[0]);
      }
    }

    // Default / city-priority fallback: unfiltered closest feature. Its enriched
    // properties (city/county/state/country) supply the admin hierarchy.
    const fallback = await this.photon.reverseGeocode({ point: query.point, limit: 1 });
    if (fallback[0]) {
      return photonFeatureToPlace(fallback[0]);
    }

    return undefined;
  }

  private storeReverseCache(key: string, place: Place): void {
    if (this.reverseCache.size >= REVERSE_CACHE_MAX_SIZE) {
      const oldestKey = this.reverseCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.reverseCache.delete(oldestKey);
      }
    }

    this.reverseCache.set(key, place);
  }

  private reverseCacheKey(query: ReverseGeocodeQuery): string {
    const priorityKey = query.priority ?? "DEFAULT";
    return `${priorityKey}:${query.point.latitude.toFixed(REVERSE_CACHE_KEY_PRECISION)},${query.point.longitude.toFixed(REVERSE_CACHE_KEY_PRECISION)}`;
  }
}

function photonFeatureToPlace(feature: PhotonFeature): Place {
  const props = feature.properties;
  const elementType = PHOTON_OSM_TYPE_TO_ELEMENT[props.osm_type];
  const nativeId = `${elementType}/${props.osm_id}`;
  const tags: Record<string, string> = {};
  if (props.osm_key && props.osm_value) {
    tags[props.osm_key] = props.osm_value;
  }

  const adminParts = readPhotonAdminParts(props);

  const place: Place = {
    id: `${PLACES_SOURCE.OSM}:${nativeId}`,
    source: PLACES_SOURCE.OSM,
    displayName: props.name ?? nativeId,
    category: categoryFromOsmTags(tags),
    location: {
      latitude: feature.geometry.coordinates[1],
      longitude: feature.geometry.coordinates[0],
    },
  };

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

  const address = buildAddressFromPhoton(props, adminParts);
  if (address) {
    place.address = address;
  }

  const boundingBox = boundingBoxFromPhotonExtent(props.extent);
  if (boundingBox) {
    place.boundingBox = boundingBox;
  }

  return place;
}

/**
 * Resolve OSM admin level for an `osm_key`/`osm_value` pair so we know which
 * Place field the feature's own `name` should be promoted into. Both Photon
 * (feature properties) and Overpass (tag dictionaries) omit the admin field
 * matching the feature's own level — without this promotion we'd lose the
 * very value we wanted.
 */
function ownAdminLevelFromOsmTag(
  osmKey: string | undefined,
  osmValue: string | undefined
): "city" | "county" | "state" | "country" | undefined {
  if (osmKey !== "place") {
    return undefined;
  }

  switch (osmValue) {
    case undefined:
      return undefined;
    case "city":
    case "town":
      return "city";
    case "county":
      return "county";
    case "state":
    case "region":
    case "province":
      return "state";
    case "country":
      return "country";
    default:
      return undefined;
  }
}

interface ResolvedAdminParts {
  city?: string;
  county?: string;
  state?: string;
  /** Full country name (e.g. "France") for the address line. */
  countryName?: string;
  /** ISO 3166-1 alpha-2 (e.g. "FR") for `Place.country`. */
  countryCode?: string;
}

function readPhotonAdminParts(props: PhotonFeature["properties"]): ResolvedAdminParts {
  const ownLevel = ownAdminLevelFromOsmTag(props.osm_key, props.osm_value);
  return {
    city: ownLevel === "city" ? props.name : props.city,
    county: ownLevel === "county" ? props.name : props.county,
    state: ownLevel === "state" ? props.name : props.state,
    countryName: ownLevel === "country" ? props.name : props.country,
    countryCode: normalizeCountryCode(props.countrycode),
  };
}

/** Pick first non-empty value from a list of candidate tag keys. */
function pickTag(tags: Record<string, string>, keys: ReadonlyArray<string>): string | undefined {
  for (const key of keys) {
    const value = tags[key]?.trim();
    if (value && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

const OSM_WHEELCHAIR_MAP: Readonly<Record<string, WheelchairAccess>> = {
  yes: WHEELCHAIR_ACCESS.YES,
  no: WHEELCHAIR_ACCESS.NO,
  limited: WHEELCHAIR_ACCESS.LIMITED,
};

function readWheelchairAccess(tags: Record<string, string>): WheelchairAccess | undefined {
  const raw = tags.wheelchair?.trim().toLowerCase();
  if (!raw) {
    return undefined;
  }

  return OSM_WHEELCHAIR_MAP[raw];
}

function readCuisines(tags: Record<string, string>): string[] | undefined {
  const raw = tags.cuisine?.trim();
  if (!raw) {
    return undefined;
  }

  const cuisines = raw
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return cuisines.length > 0 ? cuisines : undefined;
}

function overpassElementToPlaceDetails(element: OverpassElement): PlaceDetails | undefined {
  const place = overpassElementToPlace(element);
  if (!place) {
    return undefined;
  }

  const tags = element.tags ?? {};
  const details: PlaceDetails = { ...place };

  const openingHours = parseOsmOpeningHours(tags.opening_hours);
  if (openingHours) {
    details.openingHours = openingHours;
  }

  const phone = pickTag(tags, ["phone", "contact:phone"]);
  if (phone) {
    details.phone = phone;
  }

  const website = pickTag(tags, ["website", "contact:website", "url"]);
  if (website) {
    details.website = website;
  }

  const email = pickTag(tags, ["email", "contact:email"]);
  if (email) {
    details.email = email;
  }

  const wheelchairAccess = readWheelchairAccess(tags);
  if (wheelchairAccess) {
    details.wheelchairAccess = wheelchairAccess;
  }

  const description = tags.description?.trim();
  if (description) {
    details.description = description;
  }

  const cuisines = readCuisines(tags);
  if (cuisines) {
    details.cuisines = cuisines;
  }

  const brand = tags.brand?.trim();
  if (brand) {
    details.brand = brand;
  }

  return details;
}

function overpassElementToPlace(element: OverpassElement): Place | undefined {
  const center = getOverpassElementCenter(element);
  if (!center) {
    return undefined;
  }

  const tags = element.tags ?? {};
  const nativeId = `${element.type}/${element.id}`;
  const adminParts = readOverpassAdminParts(tags);

  const place: Place = {
    id: `${PLACES_SOURCE.OSM}:${nativeId}`,
    source: PLACES_SOURCE.OSM,
    displayName: tags.name ?? nativeId,
    category: categoryFromOsmTags(tags),
    location: center,
  };

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

  const address = buildAddressFromOverpassTags(tags, adminParts);
  if (address) {
    place.address = address;
  }

  if (element.bounds) {
    place.boundingBox = {
      south: element.bounds.minlat,
      west: element.bounds.minlon,
      north: element.bounds.maxlat,
      east: element.bounds.maxlon,
    };
  }

  return place;
}

/**
 * Mirror of `readPhotonAdminParts` for Overpass tag dictionaries. When the
 * element itself is a `place=city`/`town`/`county`/`state` etc., promote
 * `tags.name` into the matching slot; otherwise read the `addr:*` tags
 * directly.
 */
function readOverpassAdminParts(tags: Record<string, string>): ResolvedAdminParts {
  const ownLevel = ownAdminLevelFromOsmTag("place", tags.place);
  return {
    city: ownLevel === "city" ? tags.name : tags["addr:city"],
    county: ownLevel === "county" ? tags.name : tags["addr:county"],
    state: ownLevel === "state" ? tags.name : tags["addr:state"],
    countryName: ownLevel === "country" ? tags.name : tags["addr:country"],
    countryCode: normalizeCountryCode(tags["addr:country"]),
  };
}

function buildAddressFromPhoton(
  props: PhotonFeature["properties"],
  adminParts: ResolvedAdminParts
): string | undefined {
  return joinAddressParts([
    [props.housenumber, props.street].filter(Boolean).join(" "),
    adminParts.city,
    adminParts.state,
    props.postcode,
    adminParts.countryName,
  ]);
}

function buildAddressFromOverpassTags(
  tags: Record<string, string>,
  adminParts: ResolvedAdminParts
): string | undefined {
  return joinAddressParts([
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    adminParts.city,
    adminParts.state,
    tags["addr:postcode"],
    adminParts.countryName,
  ]);
}

function joinAddressParts(parts: ReadonlyArray<string | undefined>): string | undefined {
  const cleaned = parts.map((value) => (value ?? "").trim()).filter((value) => value.length > 0);
  return cleaned.length > 0 ? cleaned.join(", ") : undefined;
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

/** Photon extent order is [minLon, maxLat, maxLon, minLat] (verified against live API). */
function boundingBoxFromPhotonExtent(
  extent: [number, number, number, number] | undefined
): LocationBoundingBox | undefined {
  if (!extent) {
    return undefined;
  }

  return {
    west: extent[0],
    north: extent[1],
    east: extent[2],
    south: extent[3],
  };
}

function parseOsmNativeId(nativeId: string): { type: OsmElementType; osmId: string } | undefined {
  const slashIndex = nativeId.indexOf("/");
  if (slashIndex <= 0 || slashIndex === nativeId.length - 1) {
    return undefined;
  }

  const typePart = nativeId.slice(0, slashIndex);
  const osmId = nativeId.slice(slashIndex + 1);
  if (
    typePart !== OSM_ELEMENT_TYPE.NODE &&
    typePart !== OSM_ELEMENT_TYPE.WAY &&
    typePart !== OSM_ELEMENT_TYPE.RELATION
  ) {
    return undefined;
  }

  return { type: typePart, osmId };
}
