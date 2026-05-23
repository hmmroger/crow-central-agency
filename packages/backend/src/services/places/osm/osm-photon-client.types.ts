import z from "zod";
import type { LocationPoint } from "../places-manager.types.js";

export const PHOTON_LAYER = {
  HOUSE: "house",
  STREET: "street",
  LOCALITY: "locality",
  DISTRICT: "district",
  CITY: "city",
  COUNTY: "county",
  STATE: "state",
  COUNTRY: "country",
  OTHER: "other",
} as const;
export type PhotonLayer = (typeof PHOTON_LAYER)[keyof typeof PHOTON_LAYER];

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
    county: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    countrycode: z.string().optional(),
    postcode: z.string().optional(),
    /** Photon order: [minLon, maxLat, maxLon, minLat] (i.e. [west, north, east, south]). */
    extent: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  }),
});

export type PhotonFeature = z.infer<typeof PhotonFeatureSchema>;

export const PhotonResponseSchema = z.object({
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
  layers?: PhotonLayer[];
  radius?: number;
}
