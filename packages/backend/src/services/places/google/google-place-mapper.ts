import {
  BUSINESS_STATUS,
  PLACES_SOURCE,
  WHEELCHAIR_ACCESS,
  type BusinessStatus,
  type LocationBoundingBox,
  type Place,
  type PlaceDetails,
  type WheelchairAccess,
} from "../places-manager.types.js";
import {
  ADDRESS_COMPONENT_TYPE,
  applyAdminParts,
  normalizePlaceComponent,
  readAdminParts,
} from "./google-address-utils.js";
import { categoryFromGoogleTypes } from "./google-place-type-mapping.js";
import { parseGoogleOpeningHours } from "./google-opening-hours-parser.js";
import type { GoogleGeocodingResult, GooglePlace } from "./google-places-adapter.types.js";

/** Map a Places API (New) place into the lean domain `Place`; undefined when it has no location. */
export function googlePlaceToPlace(place: GooglePlace): Place | undefined {
  if (!place.location) {
    return undefined;
  }

  const adminParts = readAdminParts(place.addressComponents?.map(normalizePlaceComponent));
  const result: Place = {
    id: `${PLACES_SOURCE.GOOGLE}:${place.id}`,
    source: PLACES_SOURCE.GOOGLE,
    displayName: place.displayName?.text ?? place.id,
    category: categoryFromGoogleTypes(place.primaryType, place.types),
    location: { latitude: place.location.latitude, longitude: place.location.longitude },
  };

  applyAdminParts(result, adminParts);

  if (place.formattedAddress) {
    result.address = place.formattedAddress;
  }

  if (place.googleMapsUri) {
    result.mapsUrl = place.googleMapsUri;
  }

  const businessStatus = toBusinessStatus(place.businessStatus);
  if (businessStatus) {
    result.businessStatus = businessStatus;
  }

  if (place.viewport) {
    result.boundingBox = {
      south: place.viewport.low.latitude,
      west: place.viewport.low.longitude,
      north: place.viewport.high.latitude,
      east: place.viewport.high.longitude,
    };
  }

  return result;
}

/** Layer the Place Details (Enterprise) attributes on top of the base `Place`. */
export function googlePlaceToPlaceDetails(place: GooglePlace): PlaceDetails | undefined {
  const base = googlePlaceToPlace(place);
  if (!base) {
    return undefined;
  }

  const details: PlaceDetails = { ...base };

  const openingHours = parseGoogleOpeningHours(place.regularOpeningHours);
  if (openingHours) {
    details.openingHours = openingHours;
  }

  if (place.internationalPhoneNumber) {
    details.phone = place.internationalPhoneNumber;
  }

  if (place.websiteUri) {
    details.website = place.websiteUri;
  }

  const wheelchairAccess = readWheelchairAccess(place);
  if (wheelchairAccess) {
    details.wheelchairAccess = wheelchairAccess;
  }

  return details;
}

/** Map a single Geocoding API (v4) result into a domain `Place`. */
export function geocodingResultToPlace(result: GoogleGeocodingResult): Place {
  const adminParts = readAdminParts(result.addressComponents?.map(normalizePlaceComponent));
  const isLocality = result.types.includes(ADDRESS_COMPONENT_TYPE.LOCALITY);
  const displayName = (isLocality ? adminParts.city : undefined) ?? result.formattedAddress ?? result.placeId;

  const place: Place = {
    id: `${PLACES_SOURCE.GOOGLE}:${result.placeId}`,
    source: PLACES_SOURCE.GOOGLE,
    displayName,
    category: categoryFromGoogleTypes(undefined, result.types),
    location: { latitude: result.location.latitude, longitude: result.location.longitude },
  };

  applyAdminParts(place, adminParts);

  if (result.formattedAddress) {
    place.address = result.formattedAddress;
  }

  const boundingBox = geocodingBoundingBox(result);
  if (boundingBox) {
    place.boundingBox = boundingBox;
  }

  return place;
}

function readWheelchairAccess(place: GooglePlace): WheelchairAccess | undefined {
  const entrance = place.accessibilityOptions?.wheelchairAccessibleEntrance;
  if (entrance === undefined) {
    return undefined;
  }

  return entrance ? WHEELCHAIR_ACCESS.YES : WHEELCHAIR_ACCESS.NO;
}

/** Google's businessStatus enum maps 1:1 to our values; anything else (e.g. UNSPECIFIED) is dropped. */
function toBusinessStatus(status: string | undefined): BusinessStatus | undefined {
  if (!status) {
    return undefined;
  }

  switch (status) {
    case BUSINESS_STATUS.OPERATIONAL:
    case BUSINESS_STATUS.CLOSED_TEMPORARILY:
    case BUSINESS_STATUS.CLOSED_PERMANENTLY:
    case BUSINESS_STATUS.FUTURE_OPENING:
      return status;

    default:
      return undefined;
  }
}

function geocodingBoundingBox(result: GoogleGeocodingResult): LocationBoundingBox | undefined {
  const box = result.bounds ?? result.viewport;
  if (!box) {
    return undefined;
  }

  return {
    south: box.low.latitude,
    west: box.low.longitude,
    north: box.high.latitude,
    east: box.high.longitude,
  };
}
