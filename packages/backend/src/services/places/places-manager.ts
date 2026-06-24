import { env } from "../../config/env.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import { GooglePlacesAdapter } from "./google/google-places-adapter.js";
import { OsmPlacesAdapter } from "./osm/osm-places-adapter.js";
import { parsePlaceId } from "./places-manager-utils.js";
import type {
  GeocodeQuery,
  Place,
  PlaceDetails,
  PlacesSource,
  PlacesSourceAdapter,
  ReverseGeocodeQuery,
  SearchPlacesQuery,
} from "./places-manager.types.js";

/**
 * Provider-neutral entrypoint for place lookups. Holds one adapter per
 * `PlacesSource` and routes requests by an explicit `source` argument or,
 * for id-based lookups, by the prefix encoded in the Place id.
 */
export class PlacesManager {
  private readonly adapters = new Map<PlacesSource, PlacesSourceAdapter>();
  private readonly defaultSource: PlacesSource;

  constructor() {
    const osmAdapter = new OsmPlacesAdapter({
      photonUrl: env.PHOTON_API_URL,
      overpassUrl: env.OVERPASS_INTERPRETER_URL,
    });
    this.adapters.set(osmAdapter.source, osmAdapter);
    this.defaultSource = osmAdapter.source;

    if (env.GOOGLE_PLACES_API_KEY) {
      const googleAdapter = new GooglePlacesAdapter({
        apiKey: env.GOOGLE_PLACES_API_KEY,
        placesBaseUrl: env.GOOGLE_PLACES_API_BASE_URL,
        geocodingUrl: env.GOOGLE_GEOCODING_API_URL,
      });
      this.adapters.set(googleAdapter.source, googleAdapter);
    }
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

  public getPlaceById(id: string): Promise<PlaceDetails | undefined> {
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
