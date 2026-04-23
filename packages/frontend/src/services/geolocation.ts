import { useAppStore } from "../stores/app-store.js";

/**
 * Request geolocation from the browser and persist the result in the app store.
 * Best-effort — silently does nothing if the API is unavailable or the user denies permission.
 * Call once on app startup; the store value is available immediately on subsequent page loads.
 */
export function requestGeolocation(): void {
  if (!navigator.geolocation) {
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude.toFixed(7);
      const lng = position.coords.longitude.toFixed(7);
      const location = `${lat},${lng}`;
      useAppStore.getState().setClientLocation(location);
    },
    () => {
      // Permission denied or error — clear stale stored value
      useAppStore.getState().setClientLocation(undefined);
    }
  );
}

/** Get the cached location string from the store, or undefined if not yet available */
export function getCachedLocation(): string | undefined {
  return useAppStore.getState().clientLocation;
}
