import { logger } from "../../../utils/logger.js";
import {
  PLACES_SOURCE,
  type GeocodeQuery,
  type LocationBoundingBox,
  type LocationPoint,
  type Place,
  type PlacesSourceAdapter,
  type ReverseGeocodeQuery,
  type SearchPlacesQuery,
} from "../places-manager.types.js";
import { OSM_ELEMENT_TYPE, type OsmElementType, type OsmPlacesAdapterConfig } from "./osm-places-adapter.types.js";
import { buildOverpassByIdQuery, buildOverpassSearchQuery } from "./osm-overpass-query-builder.js";
import { OverpassClient, getOverpassElementCenter, type OverpassElement } from "./osm-overpass-client.js";
import { PhotonClient, type PhotonFeature, type PhotonOsmType } from "./osm-photon-client.js";
import { categoryFromOsmTags } from "./osm-tag-mapping.js";

const log = logger.child({ context: "osm-places-adapter" });

const REVERSE_CACHE_MAX_SIZE = 128;
/** Decimal places used when keying the reverse-geocode cache. 6dp ≈ 11 cm precision. */
const REVERSE_CACHE_KEY_PRECISION = 6;

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
    const key = this.reverseCacheKey(query.point);
    const cached = this.reverseCache.get(key);
    if (cached) {
      return cached;
    }

    const inflight = this.inflightReverse.get(key);
    if (inflight) {
      return inflight;
    }

    const fetchPromise = this.fetchReverseGeocode(query.point)
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

  public async getPlaceById(nativeId: string): Promise<Place | undefined> {
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

    return overpassElementToPlace(element);
  }

  private async fetchReverseGeocode(point: LocationPoint): Promise<Place | undefined> {
    const features = await this.photon.reverseGeocode({ point, limit: 1 });
    const feature = features[0];
    if (!feature) {
      return undefined;
    }

    return photonFeatureToPlace(feature);
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

  private reverseCacheKey(point: LocationPoint): string {
    return `${point.latitude.toFixed(REVERSE_CACHE_KEY_PRECISION)},${point.longitude.toFixed(REVERSE_CACHE_KEY_PRECISION)}`;
  }
}

function photonFeatureToPlace(feature: PhotonFeature): Place {
  const elementType = PHOTON_OSM_TYPE_TO_ELEMENT[feature.properties.osm_type];
  const nativeId = `${elementType}/${feature.properties.osm_id}`;
  const tags: Record<string, string> = {};
  if (feature.properties.osm_key && feature.properties.osm_value) {
    tags[feature.properties.osm_key] = feature.properties.osm_value;
  }

  const place: Place = {
    id: `${PLACES_SOURCE.OSM}:${nativeId}`,
    source: PLACES_SOURCE.OSM,
    displayName: feature.properties.name ?? buildAddressFromPhoton(feature) ?? nativeId,
    category: categoryFromOsmTags(tags),
    location: {
      latitude: feature.geometry.coordinates[1],
      longitude: feature.geometry.coordinates[0],
    },
  };

  const address = buildAddressFromPhoton(feature);
  if (address) {
    place.address = address;
  }

  const country = normalizeCountryCode(feature.properties.countrycode);
  if (country) {
    place.country = country;
  }

  const boundingBox = boundingBoxFromPhotonExtent(feature.properties.extent);
  if (boundingBox) {
    place.boundingBox = boundingBox;
  }

  return place;
}

function overpassElementToPlace(element: OverpassElement): Place | undefined {
  const center = getOverpassElementCenter(element);
  if (!center) {
    return undefined;
  }

  const tags = element.tags ?? {};
  const nativeId = `${element.type}/${element.id}`;
  const place: Place = {
    id: `${PLACES_SOURCE.OSM}:${nativeId}`,
    source: PLACES_SOURCE.OSM,
    displayName: tags.name ?? nativeId,
    category: categoryFromOsmTags(tags),
    location: center,
  };

  const address = buildAddressFromOverpassTags(tags);
  if (address) {
    place.address = address;
  }

  const country = normalizeCountryCode(tags["addr:country"]);
  if (country) {
    place.country = country;
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

function buildAddressFromPhoton(feature: PhotonFeature): string | undefined {
  const parts = [
    [feature.properties.housenumber, feature.properties.street].filter(Boolean).join(" "),
    feature.properties.city,
    feature.properties.state,
    feature.properties.postcode,
    feature.properties.country,
  ]
    .map((value) => (value ?? "").trim())
    .filter((value) => value.length > 0);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function buildAddressFromOverpassTags(tags: Record<string, string>): string | undefined {
  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:city"],
    tags["addr:state"],
    tags["addr:postcode"],
    tags["addr:country"],
  ]
    .map((value) => (value ?? "").trim())
    .filter((value) => value.length > 0);
  return parts.length > 0 ? parts.join(", ") : undefined;
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
