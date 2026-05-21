import type { LocationArea, SearchPlacesQuery } from "../places-manager.types.js";
import { OSM_ELEMENT_TYPE, type OsmElementType, type OsmTagFilter } from "./osm-places-adapter.types.js";
import { getOsmTagFilters } from "./osm-tag-mapping.js";

const DEFAULT_RESULT_LIMIT = 30;
const DEFAULT_TIMEOUT_SECONDS = 25;
const QUERIED_ELEMENT_TYPES: readonly OsmElementType[] = [
  OSM_ELEMENT_TYPE.NODE,
  OSM_ELEMENT_TYPE.WAY,
  OSM_ELEMENT_TYPE.RELATION,
];
const OSM_ID_PATTERN = /^[0-9]+$/;

/** Build an OverpassQL search for places matching a category within an area. */
export function buildOverpassSearchQuery(query: SearchPlacesQuery): string {
  const filters = getOsmTagFilters(query.category);
  if (filters.length === 0) {
    // OTHER or unmapped — return a no-op query so we don't accidentally fetch the world.
    return `[out:json][timeout:${DEFAULT_TIMEOUT_SECONDS}];out;`;
  }

  const areaClause = renderAreaClause(query.area);
  const statements: string[] = [];
  for (const filter of filters) {
    const filterClause = renderTagFilter(filter);
    for (const elementType of QUERIED_ELEMENT_TYPES) {
      statements.push(`${elementType}${filterClause}${areaClause};`);
    }
  }

  const limit = query.limit ?? DEFAULT_RESULT_LIMIT;
  return [`[out:json][timeout:${DEFAULT_TIMEOUT_SECONDS}];`, `(${statements.join("")});`, `out center ${limit};`].join(
    ""
  );
}

/** Build an OverpassQL lookup for a single element by its numeric OSM id. */
export function buildOverpassByIdQuery(type: OsmElementType, osmId: string): string {
  if (!OSM_ID_PATTERN.test(osmId)) {
    throw new Error(`Invalid OSM id: ${osmId}`);
  }

  return [`[out:json][timeout:${DEFAULT_TIMEOUT_SECONDS}];`, `${type}(${osmId});`, `out center;`].join("");
}

function renderAreaClause(area: LocationArea): string {
  if (area.type === "radius") {
    return `(around:${area.radiusMeters},${area.center.latitude},${area.center.longitude})`;
  }

  const { south, west, north, east } = area.boundingBox;
  return `(${south},${west},${north},${east})`;
}

function renderTagFilter(filter: OsmTagFilter): string {
  const key = escapeOverpassLiteral(filter.key);
  if (filter.value === undefined) {
    return `["${key}"]`;
  }

  const value = escapeOverpassLiteral(filter.value);
  return `["${key}"="${value}"]`;
}

function escapeOverpassLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
