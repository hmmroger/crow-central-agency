import { z } from "zod";
import type { ClientLocation } from "../server/request-context.types.js";
import type { Sensor, SensorContext } from "./sensor-manager.types.js";
import { logger } from "../utils/logger.js";

export const GEOLOCATION_SENSOR_ID = "geolocation";

const log = logger.child({ context: "geolocation-sensor" });

const OSM_LOOKUP_URL = "https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&zoom=10&format=json";

/** Timeout for OSM API requests */
const FETCH_TIMEOUT_MS = 5000;

type LocationData = {
  displayName: string;
  city: string;
  county?: string;
  state?: string;
  country: string;
};

const OpenStreetMapAddresSchema = z.object({
  city: z.string().optional(),
  town: z.string().optional(),
  village: z.string().optional(),
  county: z.string().optional(),
  state: z.string().optional(),
  country: z.string(),
  country_code: z.string(),
});

const OpenStreetMapReverseSchema = z.object({
  display_name: z.string(),
  address: OpenStreetMapAddresSchema,
});

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

  constructor() {}

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
    const url = OSM_LOOKUP_URL.replace("{lat}", String(clientLocation.latitude)).replace(
      "{lon}",
      String(clientLocation.longitude)
    );

    const response = await fetch(url, {
      headers: { "User-Agent": "CrowCentralAgency/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`OSM reverse geocode failed: HTTP ${response.status}`);
    }

    const json = await response.json();
    const parsed = OpenStreetMapReverseSchema.parse(json);
    return {
      displayName: parsed.display_name,
      city: parsed.address.city ?? parsed.address.town ?? parsed.address.village ?? "",
      county: parsed.address.county,
      state: parsed.address.state,
      country: parsed.address.country,
    };
  }
}
