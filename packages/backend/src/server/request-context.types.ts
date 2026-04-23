/** Latitude/longitude pair from the client's geolocation */
export interface ClientLocation {
  latitude: number;
  longitude: number;
}

/** Data available to any code in the request's async call chain */
export interface RequestContext {
  /** Client timezone from x-client-timezone header, e.g. "America/New_York" */
  timezone: string;
  /** Client geolocation from x-client-location header, if available */
  location: ClientLocation | undefined;
}
