import type { PlacesSource } from "./places-manager.types.js";
import { PLACES_SOURCE } from "./places-manager.types.js";

/** Separator used in Place.id between the source tag and the adapter-native id. */
const ID_SOURCE_SEPARATOR = ":";
const PLACES_SOURCE_VALUES: ReadonlySet<string> = new Set(Object.values(PLACES_SOURCE));

function isPlacesSource(value: string): value is PlacesSource {
  return PLACES_SOURCE_VALUES.has(value);
}

export function parsePlaceId(id: string): { source: PlacesSource; nativeId: string } | undefined {
  const separatorIndex = id.indexOf(ID_SOURCE_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === id.length - 1) {
    return undefined;
  }

  const sourcePart = id.slice(0, separatorIndex);
  const nativeId = id.slice(separatorIndex + 1);
  if (!isPlacesSource(sourcePart)) {
    return undefined;
  }

  return { source: sourcePart, nativeId };
}
