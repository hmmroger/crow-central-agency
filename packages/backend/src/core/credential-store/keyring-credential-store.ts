import { AsyncEntry } from "@napi-rs/keyring";
import type { CredentialStore } from "./credential-store.types.js";

const KEYRING_SERVICE_NAME = "crow-central-agency";

export class KeyringCredentialStore implements CredentialStore {
  public async set(key: string, value: string): Promise<void> {
    const entry = new AsyncEntry(KEYRING_SERVICE_NAME, key);
    await entry.setPassword(value);
  }

  public async get(key: string): Promise<string | undefined> {
    const entry = new AsyncEntry(KEYRING_SERVICE_NAME, key);
    const password = await entry.getPassword();
    return password ?? undefined;
  }

  public async delete(key: string): Promise<boolean> {
    const entry = new AsyncEntry(KEYRING_SERVICE_NAME, key);
    return entry.deleteCredential();
  }
}
