/**
 * Storage abstraction for sensitive credential blobs.
 *
 * Implementations back this with platform-native secret stores
 * (e.g. Windows Credential Manager / macOS Keychain / Linux libsecret).
 * The interface keeps the rest of the codebase decoupled from the
 * underlying secret store choice.
 *
 * `key` is a caller-supplied account-style identifier
 * (e.g. `"connector:google"`); `value` is an opaque string —
 * implementations make no assumptions about its content or format.
 */
export interface CredentialStore {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | undefined>;
  delete(key: string): Promise<boolean>;
}
