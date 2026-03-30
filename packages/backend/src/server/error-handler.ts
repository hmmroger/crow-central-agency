import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "../error/app-error.js";
import { APP_ERROR_CODES, type AppErrorCode } from "../error/app-error.types.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "error-handler" });

/** Map AppErrorCode → HTTP status code */
const HTTP_STATUS_MAP: Record<AppErrorCode, number> = {
  [APP_ERROR_CODES.UNKNOWN]: 500,
  [APP_ERROR_CODES.NOT_FOUND]: 404,
  [APP_ERROR_CODES.VALIDATION]: 400,
  [APP_ERROR_CODES.AGENT_NOT_FOUND]: 404,
  [APP_ERROR_CODES.AGENT_IMMUTABLE]: 403,
  [APP_ERROR_CODES.AGENT_NOT_RUNNING]: 409,
  [APP_ERROR_CODES.SESSION_NOT_FOUND]: 404,
  [APP_ERROR_CODES.PERMISSION_TIMEOUT]: 408,
  [APP_ERROR_CODES.PERMISSION_DENIED]: 403,
  [APP_ERROR_CODES.ARTIFACT_NOT_FOUND]: 404,
  [APP_ERROR_CODES.TASK_NOT_FOUND]: 404,
  [APP_ERROR_CODES.INVALID_STATE_TRANSITION]: 409,
  [APP_ERROR_CODES.PATH_TRAVERSAL]: 400,
  [APP_ERROR_CODES.MCP_ERROR]: 502,
  [APP_ERROR_CODES.SDK_ERROR]: 502,
  [APP_ERROR_CODES.WS_ERROR]: 500,
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
        code: APP_ERROR_CODES.UNKNOWN,
        message: "Internal server error",
      },
    });
  });
}
