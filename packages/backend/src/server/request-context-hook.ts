import type { FastifyInstance, FastifyRequest } from "fastify";
import { requestContextStorage, DEFAULT_TIMEZONE } from "./request-context.js";
import type { ClientLocation, RequestContext } from "./request-context.types.js";
import { isString } from "es-toolkit";

const CLIENT_TIMEZONE_HEADER = "x-client-timezone";
const CLIENT_LOCATION_HEADER = "x-client-location";

/** Validate that a string is a well-formed IANA timezone identifier */
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse "lat,lng" string into a ClientLocation, or undefined if invalid.
 * Both values must be finite numbers within valid coordinate ranges.
 */
function parseLocation(value: string): ClientLocation | undefined {
  const parts = value.split(",");
  if (parts.length !== 2) {
    return undefined;
  }

  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return undefined;
  }

  return { latitude, longitude };
}

/**
 * Register a Fastify preHandler hook that populates the per-request context.
 * Extracts client timezone and geolocation from headers and stores them
 * in AsyncLocalStorage for downstream access via getRequestContext().
 * Only runs for requests that pass the auth hook.
 */
export function registerRequestContextHook(server: FastifyInstance): void {
  server.addHook("preHandler", async (request: FastifyRequest) => {
    const timezoneHeader = request.headers[CLIENT_TIMEZONE_HEADER];
    const timezone =
      isString(timezoneHeader) && timezoneHeader.length > 0 && isValidTimezone(timezoneHeader)
        ? timezoneHeader
        : DEFAULT_TIMEZONE;

    const locationHeader = request.headers[CLIENT_LOCATION_HEADER];
    const location = isString(locationHeader) && locationHeader.length > 0 ? parseLocation(locationHeader) : undefined;

    const context: RequestContext = { timezone, location };
    requestContextStorage.enterWith(context);
  });
}
