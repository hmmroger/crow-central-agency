import {
  BUSINESS_STATUS,
  WEEKDAY,
  type DayOpeningHours,
  type OpeningHours,
  type OpeningHoursRange,
  type Place,
  type PlaceDetails,
  type TransitLine,
  type Weekday,
} from "../../services/places/places-manager.types.js";

const WEEKDAY_LABEL: Readonly<Record<Weekday, string>> = {
  [WEEKDAY.MONDAY]: "Monday",
  [WEEKDAY.TUESDAY]: "Tuesday",
  [WEEKDAY.WEDNESDAY]: "Wednesday",
  [WEEKDAY.THURSDAY]: "Thursday",
  [WEEKDAY.FRIDAY]: "Friday",
  [WEEKDAY.SATURDAY]: "Saturday",
  [WEEKDAY.SUNDAY]: "Sunday",
};

/** Compact list-entry block used in search results. */
export function formatPlaceSummary(place: Place): string {
  const lines = [
    `  - ID: ${place.id}`,
    `    - Name: ${place.displayName}`,
    `    - Category: ${place.category}`,
    `    - Location: ${place.location.latitude.toFixed(6)}, ${place.location.longitude.toFixed(6)}`,
  ];

  if (place.address !== undefined && place.address.length > 0) {
    lines.push(`    - Address: ${place.address}`);
  }

  if (place.businessStatus !== undefined && place.businessStatus !== BUSINESS_STATUS.OPERATIONAL) {
    lines.push(`    - Business status: ${place.businessStatus}`);
  }

  if (place.mapsUrl !== undefined && place.mapsUrl.length > 0) {
    lines.push(`    - Map: ${place.mapsUrl}`);
  }

  if (place.routing !== undefined) {
    const { durationSeconds, distanceMeters, travelMode, directionsUrl } = place.routing;
    lines.push(
      `    - Travel: ${humanizeDuration(durationSeconds)} · ${humanizeDistance(distanceMeters)} (${travelMode})`
    );
    if (directionsUrl !== undefined && directionsUrl.length > 0) {
      lines.push(`    - Directions: ${directionsUrl}`);
    }
  }

  return lines.join("\n");
}

/** "8 min" under an hour, "1 h 12 min" (or "2 h" on the hour) above. */
function humanizeDuration(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** "850 m" under a kilometre, "3.2 km" (one decimal) above. */
function humanizeDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  return `${(meters / 1000).toFixed(1)} km`;
}

/** Full-detail block returned by `places_get_details`. Layers attributes on top of the summary. */
export function formatPlaceDetails(details: PlaceDetails): string {
  const lines = [formatPlaceSummary(details)];

  if (details.phone !== undefined) {
    lines.push(`    - Phone: ${details.phone}`);
  }

  if (details.website !== undefined) {
    lines.push(`    - Website: ${details.website}`);
  }

  if (details.email !== undefined) {
    lines.push(`    - Email: ${details.email}`);
  }

  if (details.openingHours !== undefined) {
    lines.push("    - Opening hours:");
    for (const formatted of formatOpeningHoursLines(details.openingHours)) {
      lines.push(`        ${formatted}`);
    }
  }

  if (details.cuisines !== undefined && details.cuisines.length > 0) {
    lines.push(`    - Cuisines: ${details.cuisines.join(", ")}`);
  }

  if (details.brand !== undefined) {
    lines.push(`    - Brand: ${details.brand}`);
  }

  if (details.wheelchairAccess !== undefined) {
    lines.push(`    - Wheelchair access: ${details.wheelchairAccess}`);
  }

  if (details.transit !== undefined && details.transit.lines.length > 0) {
    lines.push("    - Transit lines:");
    for (const line of details.transit.lines) {
      lines.push(`        ${formatTransitLine(line)}`);
    }
  }

  if (details.description !== undefined && details.description.length > 0) {
    lines.push("    - Description:");
    for (const descriptionLine of details.description.split(/\r?\n/)) {
      lines.push(`        ${descriptionLine}`);
    }
  }

  return lines.join("\n");
}

function formatTransitLine(line: TransitLine): string {
  let formatted = `${line.vehicleType}  ${line.shortName ?? line.name}`;
  if (line.shortName !== undefined && line.shortName !== line.name) {
    formatted += ` (${line.name})`;
  }

  if (line.operator !== undefined) {
    formatted += ` — ${line.operator}`;
  }

  return formatted;
}

function formatOpeningHoursLines(hours: OpeningHours): string[] {
  if (hours.alwaysOpen) {
    return ["Open 24/7"];
  }

  const lines: string[] = [];
  for (const day of hours.weekly) {
    lines.push(formatDayOpeningHours(day));
  }

  if (hours.description !== undefined && hours.description.length > 0) {
    lines.push(`(raw: ${hours.description})`);
  }

  return lines;
}

function formatDayOpeningHours(day: DayOpeningHours): string {
  const label = WEEKDAY_LABEL[day.weekday];
  if (day.ranges.length === 0) {
    return `${label}: closed`;
  }

  const ranges = day.ranges.map(formatOpeningHoursRange).join(", ");
  return `${label}: ${ranges}`;
}

function formatOpeningHoursRange(range: OpeningHoursRange): string {
  return `${range.open}-${range.close}`;
}
