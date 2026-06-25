import type { ClientLocation } from "../server/request-context.types.js";
import type { Sensor, SensorContext } from "./sensor-manager.types.js";
import { logger } from "../utils/logger.js";
import type { PlacesManager } from "../services/places/places-manager.js";
import { PLACES_SOURCE, REVERSE_GEOCODE_PRIORITY } from "../services/places/places-manager.types.js";

export const GEOLOCATION_SENSOR_ID = "geolocation";

const log = logger.child({ context: "geolocation-sensor" });

type LocationData = {
  displayName: string;
  city: string;
  county?: string;
  state?: string;
  country?: string;
};

/**
 * Geolocation sensor that reverse-geocodes coordinates via OpenStreetMap Nominatim.
 * Caches results per coordinate to avoid redundant API calls.
 * Concurrent callers share a single in-flight fetch to prevent duplicate requests.
 */
export class GeoLocationSensor implements Sensor {
  public readonly id: string = GEOLOCATION_SENSOR_ID;
  public readonly name: string = "Geolocation";
  private cachedLocation: ClientLocation | undefined;
  private locationData: LocationData | undefined;
  private inflightFetch: Promise<LocationData> | undefined;

  constructor(private readonly placesManager: PlacesManager) {}

  public async getReading(sensorContext: SensorContext): Promise<string> {
    const clientLocation = sensorContext.location;
    if (!clientLocation) {
      return "";
    }

    const locationChanged =
      !this.locationData ||
      this.cachedLocation?.latitude !== clientLocation.latitude ||
      this.cachedLocation?.longitude !== clientLocation.longitude;

    if (locationChanged && !this.inflightFetch) {
      this.inflightFetch = this.lookupLocationData(clientLocation)
        .then((data) => {
          this.locationData = data;
          this.cachedLocation = clientLocation;
          return data;
        })
        .catch((error) => {
          log.warn({ error }, "Failed to lookup location data");
          if (this.locationData) {
            return this.locationData;
          }

          throw error;
        })
        .finally(() => {
          this.inflightFetch = undefined;
        });
    }

    if (this.inflightFetch) {
      try {
        await this.inflightFetch;
      } catch {
        // Error already logged; fall through to cached data below
      }
    }

    return this.locationData ? `Current Geolocation: ${this.locationData.displayName}` : "";
  }

  private async lookupLocationData(clientLocation: ClientLocation): Promise<LocationData> {
    const place = await this.placesManager.reverseGeocode(
      {
        point: { latitude: clientLocation.latitude, longitude: clientLocation.longitude },
        priority: REVERSE_GEOCODE_PRIORITY.CITY,
      },
      PLACES_SOURCE.OSM
    );

    if (!place?.address) {
      throw new Error(`Unable to determine address`);
    }

    return {
      displayName: place.address,
      city: place.city ?? "",
      county: place.county,
      state: place.state,
      country: place.country,
    };
  }
}
