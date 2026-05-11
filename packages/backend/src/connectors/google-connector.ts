import { env } from "../config/env.js";
import {
  CONNECTOR_AUTH_TYPE,
  CONNECTOR_ID,
  ConnectorRevokedError,
  type ConnectorProfile,
  type OAuthConnector,
  type OAuthTokens,
} from "./connector-manager.types.js";

const GOOGLE_CONNECTOR_LABEL = "Google";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

const SCOPE_USERINFO_EMAIL = "https://www.googleapis.com/auth/userinfo.email";
const SCOPE_USERINFO_PROFILE = "https://www.googleapis.com/auth/userinfo.profile";
export const SCOPE_GMAIL_MODIFY = "https://www.googleapis.com/auth/gmail.modify";
export const SCOPE_CALENDAR_EVENTS = "https://www.googleapis.com/auth/calendar.events";
export const SCOPE_CALENDAR_CALENDARLIST_READONLY = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
export const SCOPE_CONTACTS = "https://www.googleapis.com/auth/contacts";
export const SCOPE_CONTACTS_OTHER_READONLY = "https://www.googleapis.com/auth/contacts.other.readonly";

const GOOGLE_SCOPES: string[] = [
  SCOPE_USERINFO_EMAIL,
  SCOPE_USERINFO_PROFILE,
  SCOPE_GMAIL_MODIFY,
  SCOPE_CALENDAR_EVENTS,
  SCOPE_CALENDAR_CALENDARLIST_READONLY,
  SCOPE_CONTACTS,
  SCOPE_CONTACTS_OTHER_READONLY,
];

/** Raw token response shape from Google's token endpoint. */
interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

/** Raw userinfo response shape from Google. */
interface GoogleUserinfoResponse {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

/** Error body shape Google returns from token-endpoint failures. */
interface GoogleTokenError {
  error: string;
  error_description?: string;
}

export class GoogleConnector implements OAuthConnector {
  public readonly id = CONNECTOR_ID.GOOGLE;
  public readonly label = GOOGLE_CONNECTOR_LABEL;
  public readonly authType = CONNECTOR_AUTH_TYPE.OAUTH;

  public isConfigured(): boolean {
    return Boolean(env.GOOGLE_CONNECTOR_CLIENT_ID && env.GOOGLE_CONNECTOR_CLIENT_SECRET && env.CONNECTOR_CALLBACK_URL);
  }

  public scopes(): string[] {
    return [...GOOGLE_SCOPES];
  }

  public buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CONNECTOR_CLIENT_ID ?? "",
      redirect_uri: env.CONNECTOR_CALLBACK_URL ?? "",
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      state,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  public async exchangeCode(code: string): Promise<OAuthTokens> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CONNECTOR_CLIENT_ID ?? "",
        client_secret: env.GOOGLE_CONNECTOR_CLIENT_SECRET ?? "",
        redirect_uri: env.CONNECTOR_CALLBACK_URL ?? "",
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      const errorBody = await safeReadJson<GoogleTokenError>(response);
      const detail = errorBody?.error_description ?? errorBody?.error ?? `HTTP ${response.status}`;
      throw new Error(`Token exchange failed: ${detail}`);
    }

    const data = (await response.json()) as GoogleTokenResponse;
    return normalizeTokens(data);
  }

  public async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CONNECTOR_CLIENT_ID ?? "",
        client_secret: env.GOOGLE_CONNECTOR_CLIENT_SECRET ?? "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errorBody = await safeReadJson<GoogleTokenError>(response);
      // Google returns 400 with `error: "invalid_grant"` when the user has
      // revoked access. Distinguish that from generic failures so the
      // manager can clear the connection cleanly.
      if (response.status === 400 && errorBody?.error === "invalid_grant") {
        throw new ConnectorRevokedError(CONNECTOR_ID.GOOGLE, errorBody.error_description ?? errorBody.error);
      }

      const detail = errorBody?.error_description ?? errorBody?.error ?? `HTTP ${response.status}`;
      throw new Error(`Token refresh failed: ${detail}`);
    }

    const data = (await response.json()) as GoogleTokenResponse;
    return normalizeTokens(data);
  }

  public async fetchProfile(accessToken: string): Promise<ConnectorProfile> {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Profile fetch failed: ${response.status}`);
    }

    const data = (await response.json()) as GoogleUserinfoResponse;
    return {
      id: data.id,
      username: data.email,
      displayName: data.name,
      profilePicture: data.picture,
    };
  }
}

/**
 * Google returns shorthand aliases for OIDC-derived scopes in the
 * token response (`email`, `profile`) instead of the full
 * `https://www.googleapis.com/auth/userinfo.*` URLs we requested.
 * Normalize back to the requested URL form so the manager's scope
 * diff against `GOOGLE_SCOPES` doesn't produce false positives.
 */
const GOOGLE_SCOPE_ALIASES: Record<string, string> = {
  email: SCOPE_USERINFO_EMAIL,
  profile: SCOPE_USERINFO_PROFILE,
};

function normalizeGoogleScope(scope: string): string {
  return GOOGLE_SCOPE_ALIASES[scope] ?? scope;
}

function normalizeTokens(data: GoogleTokenResponse): OAuthTokens {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    grantedScopes: data.scope
      ? data.scope
          .split(" ")
          .filter((scope) => scope.length > 0)
          .map(normalizeGoogleScope)
      : [],
  };
}

async function safeReadJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}
