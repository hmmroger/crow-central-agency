import { z } from "zod";
import { RequestError } from "../../../core/error/request-error.js";
import type { LocationPoint } from "../places-manager.types.js";

const PHOTON_SERVICE_NAME = "PhotonAPI";
const PHOTON_USER_AGENT = "CrowCentralAgency/1.0";
const PHOTON_REQUEST_TIMEOUT_MS = 5_000;

const PhotonOsmTypeSchema = z.enum(["N", "W", "R"]);
export type PhotonOsmType = z.infer<typeof PhotonOsmTypeSchema>;

const PhotonFeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({
    type: z.literal("Point"),
    /** GeoJSON convention: [longitude, latitude]. */
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  properties: z.object({
    osm_id: z.number(),
    osm_type: PhotonOsmTypeSchema,
    osm_key: z.string().optional(),
    osm_value: z.string().optional(),
    name: z.string().optional(),
    street: z.string().optional(),
    housenumber: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    countrycode: z.string().optional(),
    postcode: z.string().optional(),
    /** Photon order: [minLon, maxLat, maxLon, minLat] (i.e. [west, north, east, south]). */
    extent: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  }),
});

export type PhotonFeature = z.infer<typeof PhotonFeatureSchema>;

const PhotonResponseSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(PhotonFeatureSchema),
});

export interface PhotonForwardQuery {
  text: string;
  near?: LocationPoint;
  limit?: number;
}

export interface PhotonReverseQuery {
  point: LocationPoint;
  limit?: number;
}

/**
 * Photon HTTP client. Photon is the open-source geocoder maintained by Komoot;
 * it serves both forward and reverse geocoding from OpenStreetMap data.
 * Docs: https://photon.komoot.io/
 */
export class PhotonClient {
  constructor(private readonly baseUrl: string) {}

  public async forwardGeocode(query: PhotonForwardQuery): Promise<PhotonFeature[]> {
    const params = new URLSearchParams({ q: query.text });
    if (query.near) {
      params.set("lat", String(query.near.latitude));
      params.set("lon", String(query.near.longitude));
    }

    if (query.limit !== undefined) {
      params.set("limit", String(query.limit));
    }

    const response = await this.request(`/api?${params.toString()}`);
    return response.features;
  }

  public async reverseGeocode(query: PhotonReverseQuery): Promise<PhotonFeature[]> {
    const params = new URLSearchParams({
      lat: String(query.point.latitude),
      lon: String(query.point.longitude),
    });
    if (query.limit !== undefined) {
      params.set("limit", String(query.limit));
    }

    const response = await this.request(`/reverse?${params.toString()}`);
    return response.features;
  }

  private async request(path: string): Promise<z.infer<typeof PhotonResponseSchema>> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": PHOTON_USER_AGENT },
        signal: AbortSignal.timeout(PHOTON_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new RequestError("Photon request failed (network)", undefined, undefined, PHOTON_SERVICE_NAME, {
        cause: error,
      });
    }

    if (!response.ok) {
      throw new RequestError(
        `Photon request failed: HTTP ${response.status}`,
        response.status,
        undefined,
        PHOTON_SERVICE_NAME
      );
    }

    const json = await response.json();
    return PhotonResponseSchema.parse(json);
  }
}
