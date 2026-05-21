import { z } from "zod";
import { RequestError } from "../../../core/error/request-error.js";
import { OSM_ELEMENT_TYPE } from "./osm-places-adapter.types.js";

const OVERPASS_SERVICE_NAME = "OverpassAPI";
const OVERPASS_USER_AGENT = "CrowCentralAgency/1.0";
const OVERPASS_REQUEST_TIMEOUT_MS = 30_000;

const OverpassElementTypeSchema = z.enum([OSM_ELEMENT_TYPE.NODE, OSM_ELEMENT_TYPE.WAY, OSM_ELEMENT_TYPE.RELATION]);

const OverpassElementSchema = z.object({
  type: OverpassElementTypeSchema,
  id: z.number(),
  /** Present on nodes; ways/relations expose coordinates via `center` when queried with `out center`. */
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z
    .object({
      lat: z.number(),
      lon: z.number(),
    })
    .optional(),
  bounds: z
    .object({
      minlat: z.number(),
      minlon: z.number(),
      maxlat: z.number(),
      maxlon: z.number(),
    })
    .optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

export type OverpassElement = z.infer<typeof OverpassElementSchema>;

const OverpassResponseSchema = z.object({
  elements: z.array(OverpassElementSchema),
});

/**
 * Overpass HTTP client. Overpass is a read-only query API for the OpenStreetMap
 * data graph. Callers build OverpassQL via `osm-overpass-query-builder.ts`; the
 * client handles transport and response shaping.
 * Docs: https://wiki.openstreetmap.org/wiki/Overpass_API
 */
export class OverpassClient {
  constructor(private readonly baseUrl: string) {}

  /** Run an OverpassQL query and return the raw elements. */
  public async run(query: string): Promise<OverpassElement[]> {
    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": OVERPASS_USER_AGENT,
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(OVERPASS_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new RequestError("Overpass request failed (network)", undefined, undefined, OVERPASS_SERVICE_NAME, {
        cause: error,
      });
    }

    if (!response.ok) {
      throw new RequestError(
        `Overpass request failed: HTTP ${response.status}`,
        response.status,
        undefined,
        OVERPASS_SERVICE_NAME
      );
    }

    const json = await response.json();
    const parsed = OverpassResponseSchema.parse(json);
    return parsed.elements;
  }
}

/** Read a coordinate from an Overpass element, preferring `lat`/`lon` and falling back to `center`. */
export function getOverpassElementCenter(
  element: OverpassElement
): { latitude: number; longitude: number } | undefined {
  if (element.lat !== undefined && element.lon !== undefined) {
    return { latitude: element.lat, longitude: element.lon };
  }

  if (element.center) {
    return { latitude: element.center.lat, longitude: element.center.lon };
  }

  return undefined;
}
