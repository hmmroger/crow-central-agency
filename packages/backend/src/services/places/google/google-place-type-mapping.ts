import { PLACE_CATEGORY, type PlaceCategory } from "../places-manager.types.js";

type MappedCategory = Exclude<PlaceCategory, typeof PLACE_CATEGORY.OTHER>;

/**
 * Google Place Types (Table A) per category, used as `includedTypes` for
 * searchNearby (forward) and to classify search/details results back into
 * PlaceCategory (reverse).
 *
 * Reverse classification iterates `REVERSE_LOOKUP_ORDER`; the first category
 * whose type list matches a result's `primaryType`/`types` wins. Order
 * more-specific categories before less-specific ones (e.g. SUPERMARKET before
 * SHOP).
 */
export const GOOGLE_CATEGORY_TYPES: Readonly<Record<MappedCategory, readonly string[]>> = {
  CAFE: ["cafe", "coffee_shop"],
  RESTAURANT: ["restaurant", "fast_food_restaurant"],
  BAR: ["bar", "pub", "wine_bar"],
  HOTEL: ["hotel", "lodging", "motel", "resort_hotel", "bed_and_breakfast", "hostel", "guest_house"],
  PARK: ["park", "national_park", "garden", "state_park"],
  MUSEUM: ["museum"],
  ATTRACTION: ["tourist_attraction", "historical_landmark", "monument", "historical_place"],
  SUPERMARKET: ["supermarket", "grocery_store"],
  PHARMACY: ["pharmacy", "drugstore"],
  HOSPITAL: ["hospital"],
  PARKING: ["parking"],
  TRANSIT_STATION: ["transit_station", "train_station", "subway_station", "light_rail_station", "bus_station"],
  GAS_STATION: ["gas_station"],
  SHOP: ["store", "shopping_mall"],
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

export function getGoogleIncludedTypes(category: PlaceCategory): readonly string[] {
  if (category === PLACE_CATEGORY.OTHER) {
    return [];
  }

  return GOOGLE_CATEGORY_TYPES[category];
}

export function categoryFromGoogleTypes(
  primaryType: string | undefined,
  types: readonly string[] | undefined
): PlaceCategory {
  const candidates = new Set<string>();
  if (primaryType) {
    candidates.add(primaryType);
  }

  for (const type of types ?? []) {
    candidates.add(type);
  }

  if (candidates.size === 0) {
    return PLACE_CATEGORY.OTHER;
  }

  for (const category of REVERSE_LOOKUP_ORDER) {
    for (const type of GOOGLE_CATEGORY_TYPES[category]) {
      if (candidates.has(type)) {
        return category;
      }
    }
  }

  return PLACE_CATEGORY.OTHER;
}
