import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import {
  PLACES_SOURCE,
  type GeocodeQuery,
  type Place,
  type PlacesSource,
  type PlacesSourceAdapter,
  type ReverseGeocodeQuery,
  type SearchPlacesQuery,
} from "./places-manager.types.js";

/** Separator used in Place.id between the source tag and the adapter-native id. */
const ID_SOURCE_SEPARATOR = ":";

/**
 * Provider-neutral entrypoint for place lookups. Holds one adapter per
 * `PlacesSource` and routes requests by an explicit `source` argument or,
 * for id-based lookups, by the prefix encoded in the Place id.
 *
 * The first adapter passed to the constructor is treated as the default
 * source for non-prefixed queries.
 */
export class PlacesManager {
  private readonly adapters = new Map<PlacesSource, PlacesSourceAdapter>();
  private readonly defaultSource: PlacesSource;

  constructor(adapters: PlacesSourceAdapter[]) {
    if (adapters.length === 0) {
      throw new Error("PlacesManager requires at least one source adapter");
    }

    for (const adapter of adapters) {
      this.adapters.set(adapter.source, adapter);
    }

    this.defaultSource = adapters[0].source;
  }

  public listSources(): PlacesSource[] {
    return Array.from(this.adapters.keys());
  }

  public geocode(query: GeocodeQuery, source?: PlacesSource): Promise<Place[]> {
    return this.requireAdapter(source).geocode(query);
  }

  public reverseGeocode(query: ReverseGeocodeQuery, source?: PlacesSource): Promise<Place | undefined> {
    return this.requireAdapter(source).reverseGeocode(query);
  }

  public searchPlaces(query: SearchPlacesQuery, source?: PlacesSource): Promise<Place[]> {
    return this.requireAdapter(source).searchPlaces(query);
  }

  public getPlaceById(id: string): Promise<Place | undefined> {
    const parsed = parsePlaceId(id);
    if (!parsed) {
      return Promise.resolve(undefined);
    }

    return this.requireAdapter(parsed.source).getPlaceById(parsed.nativeId);
  }

  private requireAdapter(source: PlacesSource | undefined): PlacesSourceAdapter {
    const resolved = source ?? this.defaultSource;
    const adapter = this.adapters.get(resolved);
    if (!adapter) {
      throw new AppError(`Places source not registered: ${resolved}`, APP_ERROR_CODES.PLACES_SOURCE_NOT_REGISTERED);
    }

    return adapter;
  }
}

function parsePlaceId(id: string): { source: PlacesSource; nativeId: string } | undefined {
  const separatorIndex = id.indexOf(ID_SOURCE_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === id.length - 1) {
    return undefined;
  }

  const sourcePart = id.slice(0, separatorIndex);
  const nativeId = id.slice(separatorIndex + 1);
  if (!isPlacesSource(sourcePart)) {
    return undefined;
  }

  return { source: sourcePart, nativeId };
}

function isPlacesSource(value: string): value is PlacesSource {
  return value === PLACES_SOURCE.OSM || value === PLACES_SOURCE.GOOGLE;
}
