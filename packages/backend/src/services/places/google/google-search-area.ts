import type { LocationArea, LocationPoint } from "../places-manager.types.js";

/** Places API (New) searchNearby caps the locationRestriction radius at 50 km. */
const MAX_SEARCH_RADIUS_METERS = 50_000;
const EARTH_RADIUS_METERS = 6_371_000;

/** Convert a search area into the circle Google's searchNearby accepts (radius clamped). */
export function areaToCircle(area: LocationArea): { center: LocationPoint; radiusMeters: number } {
  if (area.type === "radius") {
    return { center: area.center, radiusMeters: clampRadius(area.radiusMeters) };
  }

  const { south, west, north, east } = area.boundingBox;
  const center: LocationPoint = { latitude: (south + north) / 2, longitude: (west + east) / 2 };
  const circumscribingRadius = haversineMeters(center, { latitude: north, longitude: east });
  return { center, radiusMeters: clampRadius(circumscribingRadius) };
}

function clampRadius(radiusMeters: number): number {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    return MAX_SEARCH_RADIUS_METERS;
  }

  return Math.min(radiusMeters, MAX_SEARCH_RADIUS_METERS);
}

function haversineMeters(from: LocationPoint, to: LocationPoint): number {
  const fromLatRad = toRadians(from.latitude);
  const toLatRad = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(fromLatRad) * Math.cos(toLatRad) * Math.sin(deltaLon / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
