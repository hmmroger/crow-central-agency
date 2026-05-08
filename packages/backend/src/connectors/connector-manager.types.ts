import { z } from "zod";

export const CONNECTOR_ID = {
  GOOGLE: "GOOGLE",
} as const;

export type ConnectorId = (typeof CONNECTOR_ID)[keyof typeof CONNECTOR_ID];

/**
 * Profile of the connected account.
 */
export interface ConnectorProfile {
  id: string;
  username: string;
  displayName?: string;
  profilePicture?: string;
}

export const CONNECTOR_AUTH_TYPE = {
  OAUTH: "OAUTH",
} as const;

export type ConnectorAuthType = (typeof CONNECTOR_AUTH_TYPE)[keyof typeof CONNECTOR_AUTH_TYPE];

export const OAuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.number(),
  grantedScopes: z.array(z.string()),
});

export type OAuthTokens = z.infer<typeof OAuthTokensSchema>;

/** In-memory pending OAuth state record, keyed by the random hex `state`. */
export interface PendingOAuthState {
  agentId: string;
  connectorId: string;
  expiresAt: number;
  returnOrigin: string;
}

export class ConnectorRevokedError extends Error {
  constructor(
    public readonly connectorId: string,
    message?: string
  ) {
    super(message ?? `Connector ${connectorId} access was revoked`);
    this.name = "ConnectorRevokedError";
  }
}

export interface ConnectionRecord {
  agentId: string;
  connectorId: string;
  profile: ConnectorProfile;
  connectedTimestamp: number;
  grantedScopes: string[];
  credentialKey: string;
}

export interface CallbackResult {
  agentId: string;
  connectorId: string;
  returnOrigin: string;
  status: "ok" | "error";
  /** Set when `status === "error"` (the OAuth provider's error code). */
  reason?: string;
}

export interface ConnectorAccess {
  accessToken: string;
  grantedScopes: string[];
}

export interface BaseConnector {
  readonly id: ConnectorId;
  readonly label: string;
  readonly authType: ConnectorAuthType;
  isConfigured(): boolean;
}

export interface OAuthConnector extends BaseConnector {
  readonly authType: (typeof CONNECTOR_AUTH_TYPE)["OAUTH"];
  scopes(): string[];
  buildAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<OAuthTokens>;
  refreshTokens(refreshToken: string): Promise<OAuthTokens>;
  fetchProfile(accessToken: string): Promise<ConnectorProfile>;
}

export type Connector = OAuthConnector;
