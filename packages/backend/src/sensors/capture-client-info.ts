import { getRequestContext } from "../server/request-context.js";
import { CLIENT_STORE_LOCATION_KEY, CLIENT_STORE_TABLE, CLIENT_STORE_TIMEZONE_KEY } from "../config/constants.js";
import type { ObjectStoreProvider } from "../core/store/object-store.types.js";

export async function captureClientInfo(store: ObjectStoreProvider): Promise<void> {
  const reqContext = getRequestContext();
  const timezone = reqContext.timezone;
  await store.set(CLIENT_STORE_TABLE, CLIENT_STORE_TIMEZONE_KEY, timezone);
  const clientLocation = reqContext.location;
  if (clientLocation) {
    await store.set(CLIENT_STORE_TABLE, CLIENT_STORE_LOCATION_KEY, clientLocation);
  } else {
    await store.delete(CLIENT_STORE_TABLE, CLIENT_STORE_LOCATION_KEY);
  }
}
