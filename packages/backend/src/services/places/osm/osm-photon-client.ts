import type z from "zod";
import { RequestError } from "../../../core/error/request-error.js";
import {
  PhotonResponseSchema,
  type PhotonFeature,
  type PhotonForwardQuery,
  type PhotonReverseQuery,
} from "./osm-photon-client.types.js";

const PHOTON_SERVICE_NAME = "PhotonAPI";
const PHOTON_USER_AGENT = "CrowCentralAgency/1.0";
const PHOTON_REQUEST_TIMEOUT_MS = 5_000;

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

    if (query.layers) {
      query.layers.forEach((layer) => params.append("layer", layer));
    }

    if (query.radius) {
      params.set("radius", `${query.radius}`);
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
