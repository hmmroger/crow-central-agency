import type { FastifyInstance } from "fastify";
import type { ConnectorManager } from "../connectors/connector-manager.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";

export async function registerConnectorsRoutes(server: FastifyInstance, connectorManager: ConnectorManager) {
  /**
   * OAuth provider redirect target.
   */
  server.get<{ Querystring: { state?: string; code?: string; error?: string; error_description?: string } }>(
    "/auth/callback",
    async (request, reply) => {
      const { state, code, error, error_description: errorDescription } = request.query;
      if (typeof state !== "string" || state.length === 0) {
        throw new AppError("OAuth callback missing state", APP_ERROR_CODES.VALIDATION);
      }

      const result = await connectorManager.handleCallback(state, {
        code,
        providerError: error,
        providerErrorDescription: errorDescription,
      });

      const url = new URL("/", result.returnOrigin);
      url.searchParams.set("agent", result.agentId);
      url.searchParams.set("connector", result.connectorId);
      url.searchParams.set("status", result.status);
      if (result.reason) {
        url.searchParams.set("reason", result.reason);
      }

      return reply.redirect(url.toString());
    }
  );
}
