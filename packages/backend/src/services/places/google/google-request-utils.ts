import { clamp } from "../../../utils/number-utils.js";
import { safeReadGoogleError } from "../../google/google-request.js";
import type { LocationPoint } from "../places-manager.types.js";

/** Places API (New) caps maxResultCount at 20 for both searchText and searchNearby. */
const MAX_RESULT_COUNT = 20;
const MIN_RESULT_COUNT = 1;

/** Clamp a caller-supplied result limit into the Places API window; undefined defaults to the cap. */
export function clampResultCount(limit: number | undefined): number {
  if (limit === undefined) {
    return MAX_RESULT_COUNT;
  }

  return clamp(Math.trunc(limit), MIN_RESULT_COUNT, MAX_RESULT_COUNT);
}

/** Shape a LocationPoint into Google's `{ latitude, longitude }` LatLng literal. */
export function toLatLng(point: LocationPoint): { latitude: number; longitude: number } {
  return { latitude: point.latitude, longitude: point.longitude };
}

/** Best-effort extraction of Google's `error.message`/`error.status` from a failed Places or Geocoding response. */
export async function readGoogleErrorMessage(response: Response): Promise<string | undefined> {
  const body = await safeReadGoogleError(response);
  return body?.error?.message ?? body?.error?.status;
}
