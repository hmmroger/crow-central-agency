import crypto from "node:crypto";
import { TIME_MODE, type ConnectorInfo } from "@crow-central-agency/shared";
import { env } from "../config/env.js";
import { container } from "../container.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import type { ObjectStoreProvider } from "../core/store/object-store.types.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { CrowScheduler } from "../services/crow-scheduler.js";
import { logger } from "../utils/logger.js";
import {
  ConnectorRevokedError,
  OAuthTokensSchema,
  type CallbackResult,
  type ConnectionRecord,
  type Connector,
  type ConnectorAccess,
  type OAuthTokens,
  type PendingOAuthState,
} from "./connector-manager.types.js";

const CONNECTOR_CONNECTIONS_TABLE = "connector_connections";
const PENDING_STATE_SWEEP_WORK_ID = "connector-manager:pending-state-sweep";
const DEFAULT_PENDING_STATE_TTL_MS = 600_000;
const STATE_BYTE_LENGTH = 32;
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60_000;

const log = logger.child({ context: "connector-manager" });

export class ConnectorManager {
  private readonly connectors = new Map<string, Connector>();
  private readonly pendingStates = new Map<string, PendingOAuthState>();
  private readonly refreshInFlight = new Map<string, Promise<ConnectorAccess>>();
  private readonly pendingStateTtlMs: number;

  constructor(
    private readonly connectionStore: ObjectStoreProvider,
    private readonly agentRegistry: AgentRegistry,
    crowScheduler: CrowScheduler
  ) {
    this.pendingStateTtlMs = env.OAUTH_PENDING_STATE_TTL_MS ?? DEFAULT_PENDING_STATE_TTL_MS;
    crowScheduler.scheduleWork(PENDING_STATE_SWEEP_WORK_ID, TIME_MODE.EVERY, [{ minute: 1 }], () => {
      this.sweepExpiredPendingStates();
    });
  }

  public registerConnector(connector: Connector): void {
    this.connectors.set(connector.id, connector);
  }

  public async listConnectorsForAgent(agentId: string): Promise<ConnectorInfo[]> {
    this.agentRegistry.getAgent(agentId);

    const result: ConnectorInfo[] = [];
    for (const connector of this.connectors.values()) {
      const record = await this.connectionStore.get<ConnectionRecord>(
        CONNECTOR_CONNECTIONS_TABLE,
        buildConnectionKey(agentId, connector.id)
      );
      const info: ConnectorInfo = {
        id: connector.id,
        label: connector.label,
        configured: connector.isConfigured(),
      };

      if (record) {
        info.connection = {
          profileUsername: record.value.profile.username,
          profileDisplayName: record.value.profile.displayName,
          profilePicture: record.value.profile.profilePicture,
          connectedTimestamp: record.value.connectedTimestamp,
          needsReconnect: !grantCovers(record.value.grantedScopes, connector.scopes()),
        };
      }

      result.push(info);
    }

    return result;
  }

  public async connect(agentId: string, connectorId: string, returnOrigin: string): Promise<{ authUrl: string }> {
    if (!env.CORS_ORIGINS.includes(returnOrigin)) {
      throw new AppError(`Origin ${returnOrigin} is not in CORS_ORIGINS`, APP_ERROR_CODES.VALIDATION);
    }

    this.agentRegistry.getAgent(agentId);
    const connector = this.getConnector(connectorId);
    if (!connector.isConfigured()) {
      throw new AppError(`Connector ${connectorId} is not configured`, APP_ERROR_CODES.VALIDATION);
    }

    const state = generateOAuthState();
    this.pendingStates.set(state, {
      agentId,
      connectorId,
      expiresAt: Date.now() + this.pendingStateTtlMs,
      returnOrigin,
    });

    return { authUrl: connector.buildAuthUrl(state) };
  }

  public async handleCallback(
    state: string,
    options: { code?: string; providerError?: string; providerErrorDescription?: string } = {}
  ): Promise<CallbackResult> {
    const pending = this.consumePendingState(state);
    if (!pending) {
      throw new AppError("Invalid or expired OAuth state", APP_ERROR_CODES.VALIDATION);
    }

    if (pending.expiresAt <= Date.now()) {
      throw new AppError("OAuth state has expired", APP_ERROR_CODES.VALIDATION);
    }

    if (options.providerError) {
      log.info(
        {
          agentId: pending.agentId,
          connectorId: pending.connectorId,
          providerError: options.providerError,
          providerErrorDescription: options.providerErrorDescription,
        },
        "Connector flow aborted by provider"
      );
      return {
        agentId: pending.agentId,
        connectorId: pending.connectorId,
        returnOrigin: pending.returnOrigin,
        status: "error",
        reason: options.providerError,
      };
    }

    if (!options.code) {
      throw new AppError("OAuth callback requires a code or provider error", APP_ERROR_CODES.VALIDATION);
    }

    const connector = this.getConnector(pending.connectorId);
    const tokens = await connector.exchangeCode(options.code);
    const profile = await connector.fetchProfile(tokens.accessToken);

    const credentialKey = buildCredentialKey(pending.agentId, connector.id);
    await container.credentialStore.set(credentialKey, JSON.stringify(tokens));

    const record: ConnectionRecord = {
      agentId: pending.agentId,
      connectorId: connector.id,
      profile,
      connectedTimestamp: Date.now(),
      grantedScopes: tokens.grantedScopes,
      credentialKey,
    };
    const connectionKey = buildConnectionKey(pending.agentId, connector.id);
    try {
      await this.connectionStore.set<ConnectionRecord>(CONNECTOR_CONNECTIONS_TABLE, connectionKey, record);
    } catch (storeError) {
      try {
        await container.credentialStore.delete(credentialKey);
      } catch (cleanupError) {
        log.error(
          { err: cleanupError, agentId: pending.agentId, connectorId: connector.id, credentialKey },
          "Failed to roll back keyring entry after connection metadata write failure"
        );
      }

      throw storeError;
    }

    log.info(
      { agentId: pending.agentId, connectorId: connector.id, username: profile.username, scopes: tokens.grantedScopes },
      "Connector connected"
    );
    return {
      agentId: pending.agentId,
      connectorId: connector.id,
      returnOrigin: pending.returnOrigin,
      status: "ok",
    };
  }

  /**
   * Return the runtime authorization grant for the given (agent, connector)
   * pair, refreshing if the cached access token is expired or close to
   * expiring. The returned `grantedScopes` reflects what the provider
   * actually granted (which may be narrower than what we requested),
   * letting consumers self-gate features by scope.
   */
  public async getAccess(agentId: string, connectorId: string): Promise<ConnectorAccess> {
    this.agentRegistry.getAgent(agentId);
    const connector = this.getConnector(connectorId);
    const connectionKey = buildConnectionKey(agentId, connectorId);
    const recordEntry = await this.connectionStore.get<ConnectionRecord>(CONNECTOR_CONNECTIONS_TABLE, connectionKey);
    if (!recordEntry) {
      throw new AppError(`Connector ${connectorId} is not connected for agent ${agentId}`, APP_ERROR_CODES.NOT_FOUND);
    }

    const record = recordEntry.value;
    const stored = await container.credentialStore.get(record.credentialKey);
    if (!stored) {
      log.warn(
        { agentId, connectorId, credentialKey: record.credentialKey },
        "Connection metadata is orphaned (no keyring entry) - clearing"
      );
      await this.connectionStore.delete(CONNECTOR_CONNECTIONS_TABLE, connectionKey);
      throw new AppError(
        `Connector ${connectorId} credentials missing for agent ${agentId} - please reconnect`,
        APP_ERROR_CODES.UNAUTHORIZED
      );
    }

    const parseResult = OAuthTokensSchema.safeParse(JSON.parse(stored));
    if (!parseResult.success) {
      throw new AppError("Stored token blob is malformed", APP_ERROR_CODES.UNKNOWN);
    }

    const tokens = parseResult.data;
    if (tokens.expiresAt - Date.now() > ACCESS_TOKEN_REFRESH_BUFFER_MS) {
      return { accessToken: tokens.accessToken, grantedScopes: tokens.grantedScopes };
    }

    if (!tokens.refreshToken) {
      throw new AppError(
        `Connector ${connectorId} access token expired and no refresh token is available`,
        APP_ERROR_CODES.UNAUTHORIZED
      );
    }

    const inflightKey = buildConnectionKey(agentId, connectorId);
    const existing = this.refreshInFlight.get(inflightKey);
    if (existing) {
      return existing;
    }

    const refreshPromise = this.refreshAndPersist(connector, tokens, record).finally(() => {
      this.refreshInFlight.delete(inflightKey);
    });
    this.refreshInFlight.set(inflightKey, refreshPromise);
    return refreshPromise;
  }

  /**
   * Disconnect a connector for the given agent: clear both the keyring
   * entry and the connection metadata. Throws NOT_FOUND if the connector
   * wasn't connected to begin with.
   */
  public async disconnect(agentId: string, connectorId: string): Promise<void> {
    this.agentRegistry.getAgent(agentId);
    this.getConnector(connectorId);

    const connectionKey = buildConnectionKey(agentId, connectorId);
    const recordEntry = await this.connectionStore.get<ConnectionRecord>(CONNECTOR_CONNECTIONS_TABLE, connectionKey);
    if (!recordEntry) {
      throw new AppError(`Connector ${connectorId} is not connected for agent ${agentId}`, APP_ERROR_CODES.NOT_FOUND);
    }

    const inflightKey = buildConnectionKey(agentId, connectorId);
    const inFlight = this.refreshInFlight.get(inflightKey);
    if (inFlight) {
      await inFlight.catch(() => undefined);
    }

    await this.removeConnection(agentId, connectorId, recordEntry.value.credentialKey);
    log.info({ agentId, connectorId }, "Connector disconnected");
  }

  private async refreshAndPersist(
    connector: Connector,
    tokens: OAuthTokens,
    record: ConnectionRecord
  ): Promise<ConnectorAccess> {
    if (!tokens.refreshToken) {
      throw new AppError(
        `Connector ${connector.id} access token expired and no refresh token is available`,
        APP_ERROR_CODES.UNAUTHORIZED
      );
    }

    let refreshed: OAuthTokens;
    try {
      refreshed = await connector.refreshTokens(tokens.refreshToken);
    } catch (error) {
      if (error instanceof ConnectorRevokedError) {
        log.info(
          { agentId: record.agentId, connectorId: connector.id },
          "Connector access revoked at provider - clearing connection"
        );
        await this.removeConnection(record.agentId, connector.id, record.credentialKey);
        throw new AppError(
          `Connector ${connector.id} access was revoked - please reconnect`,
          APP_ERROR_CODES.UNAUTHORIZED
        );
      }

      throw error;
    }

    // Some providers omit a new refresh token on refresh; fall back to the existing one.
    const merged: OAuthTokens = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
      expiresAt: refreshed.expiresAt,
      grantedScopes: refreshed.grantedScopes.length > 0 ? refreshed.grantedScopes : tokens.grantedScopes,
    };
    await container.credentialStore.set(record.credentialKey, JSON.stringify(merged));

    if (merged.grantedScopes.length > 0 && !scopeSetsEqual(merged.grantedScopes, record.grantedScopes)) {
      const updated: ConnectionRecord = { ...record, grantedScopes: merged.grantedScopes };
      const connectionKey = buildConnectionKey(record.agentId, connector.id);
      await this.connectionStore.set<ConnectionRecord>(CONNECTOR_CONNECTIONS_TABLE, connectionKey, updated);
    }

    return { accessToken: merged.accessToken, grantedScopes: merged.grantedScopes };
  }

  private async removeConnection(agentId: string, connectorId: string, credentialKey: string): Promise<void> {
    try {
      await container.credentialStore.delete(credentialKey);
    } catch (error) {
      log.error({ err: error, agentId, connectorId, credentialKey }, "Failed to delete keyring entry");
    }

    await this.connectionStore.delete(CONNECTOR_CONNECTIONS_TABLE, buildConnectionKey(agentId, connectorId));
  }

  private getConnector(connectorId: string): Connector {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new AppError(`Unknown connector ${connectorId}`, APP_ERROR_CODES.NOT_FOUND);
    }

    return connector;
  }

  private consumePendingState(state: string): PendingOAuthState | undefined {
    const entry = this.pendingStates.get(state);
    if (entry) {
      this.pendingStates.delete(state);
    }

    return entry;
  }

  private sweepExpiredPendingStates(): void {
    const now = Date.now();
    let removed = 0;
    for (const [state, entry] of this.pendingStates) {
      if (entry.expiresAt <= now) {
        this.pendingStates.delete(state);
        removed += 1;
      }
    }

    if (removed > 0) {
      log.debug({ removed }, "Swept expired OAuth pending states");
    }
  }
}

/** 32-byte hex string used as the OAuth `state` parameter (CSRF token + record id). */
function generateOAuthState(): string {
  return crypto.randomBytes(STATE_BYTE_LENGTH).toString("hex");
}

/** Composite key for the connection metadata record and the in-flight refresh map. */
function buildConnectionKey(agentId: string, connectorId: string): string {
  return `${agentId}:${connectorId}`;
}

/** Composite keyring account name for the credential blob. */
function buildCredentialKey(agentId: string, connectorId: string): string {
  return `connector:${agentId}:${connectorId}`;
}

function grantCovers(granted: string[], required: string[]): boolean {
  return required.every((scope) => granted.includes(scope));
}

function scopeSetsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((scope, index) => scope === rightSorted[index]);
}
