import type { Place } from "../places-manager.types.js";
import type { GoogleAddressComponent } from "./google-places-adapter.types.js";

/** A normalized address component bridging Places-New and Geocoding shapes. */
interface NormalizedAddressComponent {
  types: readonly string[];
  long?: string;
  short?: string;
}

interface ResolvedAdminParts {
  city?: string;
  county?: string;
  state?: string;
  countryCode?: string;
}

export const ADDRESS_COMPONENT_TYPE = {
  LOCALITY: "locality",
  ADMIN_AREA_1: "administrative_area_level_1",
  ADMIN_AREA_2: "administrative_area_level_2",
  COUNTRY: "country",
} as const;

export function normalizePlaceComponent(component: GoogleAddressComponent): NormalizedAddressComponent {
  return { types: component.types, long: component.longText, short: component.shortText };
}

export function readAdminParts(components: NormalizedAddressComponent[] | undefined): ResolvedAdminParts {
  if (!components) {
    return {};
  }

  return {
    city: findComponentLong(components, ADDRESS_COMPONENT_TYPE.LOCALITY),
    county: findComponentLong(components, ADDRESS_COMPONENT_TYPE.ADMIN_AREA_2),
    state: findComponentLong(components, ADDRESS_COMPONENT_TYPE.ADMIN_AREA_1),
    countryCode: normalizeCountryCode(findComponentShort(components, ADDRESS_COMPONENT_TYPE.COUNTRY)),
  };
}

export function applyAdminParts(place: Place, adminParts: ResolvedAdminParts): void {
  if (adminParts.city) {
    place.city = adminParts.city;
  }

  if (adminParts.county) {
    place.county = adminParts.county;
  }

  if (adminParts.state) {
    place.state = adminParts.state;
  }

  if (adminParts.countryCode) {
    place.country = adminParts.countryCode;
  }
}

function findComponentLong(components: NormalizedAddressComponent[], type: string): string | undefined {
  return components.find((component) => component.types.includes(type))?.long;
}

function findComponentShort(components: NormalizedAddressComponent[], type: string): string | undefined {
  return components.find((component) => component.types.includes(type))?.short;
}

function normalizeCountryCode(code: string | undefined): string | undefined {
  if (!code) {
    return undefined;
  }

  const trimmed = code.trim();
  if (trimmed.length !== 2) {
    return undefined;
  }

  return trimmed.toUpperCase();
}
