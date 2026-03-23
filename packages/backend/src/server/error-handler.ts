import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "../error/app-error.js";
import { AppErrorCodes, type AppErrorCode } from "../error/app-error.types.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "error-handler" });

/** Map AppErrorCode → HTTP status code */
const HTTP_STATUS_MAP: Record<AppErrorCode, number> = {
  [AppErrorCodes.Unknown]: 500,
  [AppErrorCodes.NotFound]: 404,
  [AppErrorCodes.Validation]: 400,
  [AppErrorCodes.AgentNotFound]: 404,
  [AppErrorCodes.AgentBusy]: 409,
  [AppErrorCodes.AgentNotRunning]: 409,
  [AppErrorCodes.SessionNotFound]: 404,
  [AppErrorCodes.PermissionTimeout]: 408,
  [AppErrorCodes.PermissionDenied]: 403,
  [AppErrorCodes.ArtifactNotFound]: 404,
  [AppErrorCodes.PathTraversal]: 400,
  [AppErrorCodes.McpError]: 502,
  [AppErrorCodes.SdkError]: 502,
  [AppErrorCodes.WsError]: 500,
};

/**
 * Register Fastify error handler.
 * Maps AppError codes → HTTP status codes. Unknown errors → 500.
 * Route concern only — services throw AppError, this handler maps to HTTP.
 */
export function registerErrorHandler(server: FastifyInstance): void {
  server.setErrorHandler((error: Error, _request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      const httpStatus = HTTP_STATUS_MAP[error.errorCode] ?? 500;

      if (httpStatus >= 500) {
        log.error({ errorCode: error.errorCode, message: error.message }, "Server error");
      } else {
        log.warn({ errorCode: error.errorCode, message: error.message }, "Client error");
      }

      return reply.status(httpStatus).send({
        success: false,
        error: {
          code: error.errorCode,
          message: error.message,
        },
      });
    }

    // Unknown/unexpected error
    log.error(error, "Unhandled error");

    return reply.status(500).send({
      success: false,
      error: {
        code: AppErrorCodes.Unknown,
        message: "Internal server error",
      },
    });
  });
}
