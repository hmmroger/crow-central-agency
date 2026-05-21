import { PLACE_CATEGORY, type PlaceCategory } from "../places-manager.types.js";
import type { OsmTagFilter } from "./osm-places-adapter.types.js";

type MappedCategory = Exclude<PlaceCategory, typeof PLACE_CATEGORY.OTHER>;

/**
 * Tag predicates per category, used to build Overpass queries (forward)
 * and to classify Photon/Overpass results back into PlaceCategory (reverse).
 *
 * Reverse classification iterates `REVERSE_LOOKUP_ORDER`; the first category
 * whose filter list matches a result's tags wins. Order more-specific
 * categories before less-specific ones (e.g. SUPERMARKET before SHOP).
 */
export const OSM_CATEGORY_TAGS: Readonly<Record<MappedCategory, readonly OsmTagFilter[]>> = {
  CAFE: [{ key: "amenity", value: "cafe" }],
  RESTAURANT: [
    { key: "amenity", value: "restaurant" },
    { key: "amenity", value: "fast_food" },
  ],
  BAR: [
    { key: "amenity", value: "bar" },
    { key: "amenity", value: "pub" },
  ],
  HOTEL: [
    { key: "tourism", value: "hotel" },
    { key: "tourism", value: "hostel" },
    { key: "tourism", value: "guest_house" },
  ],
  PARK: [
    { key: "leisure", value: "park" },
    { key: "leisure", value: "garden" },
  ],
  MUSEUM: [{ key: "tourism", value: "museum" }],
  ATTRACTION: [
    { key: "tourism", value: "attraction" },
    { key: "historic", value: "monument" },
  ],
  SUPERMARKET: [
    { key: "shop", value: "supermarket" },
    { key: "shop", value: "convenience" },
  ],
  PHARMACY: [
    { key: "amenity", value: "pharmacy" },
    { key: "healthcare", value: "pharmacy" },
  ],
  HOSPITAL: [
    { key: "amenity", value: "hospital" },
    { key: "healthcare", value: "hospital" },
  ],
  PARKING: [{ key: "amenity", value: "parking" }],
  TRANSIT_STATION: [
    { key: "railway", value: "station" },
    { key: "public_transport", value: "station" },
    { key: "amenity", value: "bus_station" },
  ],
  GAS_STATION: [{ key: "amenity", value: "fuel" }],
  SHOP: [{ key: "shop" }],
};

const REVERSE_LOOKUP_ORDER: readonly MappedCategory[] = [
  PLACE_CATEGORY.CAFE,
  PLACE_CATEGORY.RESTAURANT,
  PLACE_CATEGORY.BAR,
  PLACE_CATEGORY.HOTEL,
  PLACE_CATEGORY.PARK,
  PLACE_CATEGORY.MUSEUM,
  PLACE_CATEGORY.ATTRACTION,
  PLACE_CATEGORY.SUPERMARKET,
  PLACE_CATEGORY.PHARMACY,
  PLACE_CATEGORY.HOSPITAL,
  PLACE_CATEGORY.PARKING,
  PLACE_CATEGORY.TRANSIT_STATION,
  PLACE_CATEGORY.GAS_STATION,
  PLACE_CATEGORY.SHOP,
];

export function getOsmTagFilters(category: PlaceCategory): readonly OsmTagFilter[] {
  if (category === PLACE_CATEGORY.OTHER) {
    return [];
  }

  return OSM_CATEGORY_TAGS[category];
}

export function categoryFromOsmTags(tags: Record<string, string | undefined> | undefined): PlaceCategory {
  if (!tags) {
    return PLACE_CATEGORY.OTHER;
  }

  for (const category of REVERSE_LOOKUP_ORDER) {
    for (const filter of OSM_CATEGORY_TAGS[category]) {
      if (matchesFilter(tags, filter)) {
        return category;
      }
    }
  }

  return PLACE_CATEGORY.OTHER;
}

function matchesFilter(tags: Record<string, string | undefined>, filter: OsmTagFilter): boolean {
  const tagValue = tags[filter.key];
  if (tagValue === undefined) {
    return false;
  }

  if (filter.value === undefined) {
    return true;
  }

  return tagValue === filter.value;
}
