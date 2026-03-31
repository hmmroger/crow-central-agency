import type { FastifyInstance } from "fastify";
import { CLIENT_MESSAGE_TYPE, ClientMessageSchema } from "@crow-central-agency/shared";
import type { WsBroadcaster } from "../services/ws-broadcaster.js";
import type { AgentOrchestrator } from "../services/agent-orchestrator.js";
import type { PermissionHandler } from "../services/permission-handler.js";
import { AppError } from "../error/app-error.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "websocket" });

/**
 * Set up WebSocket endpoint with message routing.
 * Handles send_message, inject_message, permission_response.
 * No subscribe/unsubscribe - server broadcasts all messages to all connected clients.
 */
export async function setupWebSocket(
  server: FastifyInstance,
  broadcaster: WsBroadcaster,
  orchestrator: AgentOrchestrator,
  permissionHandler: PermissionHandler
) {
  server.get("/ws", { websocket: true }, (socket) => {
    log.debug("WebSocket client connected");
    broadcaster.addClient(socket);

    socket.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        const result = ClientMessageSchema.safeParse(data);

        if (!result.success) {
          log.warn({ error: result.error }, "Invalid WebSocket message");
          broadcaster.sendTo(socket, {
            type: "error",
            code: "ws_error",
            message: "Invalid message format",
          });

          return;
        }

        const message = result.data;

        switch (message.type) {
          case CLIENT_MESSAGE_TYPE.SEND_MESSAGE:
            orchestrator.sendMessage(message.agentId, message.message).catch((error) => {
              log.error({ agentId: message.agentId, error }, "Failed to send message");
              broadcaster.sendTo(socket, {
                type: "error",
                agentId: message.agentId,
                code: error instanceof AppError ? error.errorCode : "sdk_error",
                message: error instanceof Error ? error.message : "Failed to send message",
              });
            });
            break;

          case CLIENT_MESSAGE_TYPE.INJECT_MESSAGE:
            try {
              orchestrator.injectMessage(message.agentId, message.message);
            } catch (injectError) {
              log.error({ agentId: message.agentId, error: injectError }, "Failed to inject message");
              broadcaster.sendTo(socket, {
                type: "error",
                agentId: message.agentId,
                code: injectError instanceof AppError ? injectError.errorCode : "sdk_error",
                message: injectError instanceof Error ? injectError.message : "Agent is not streaming",
              });
            }

            break;

          case "permission_response":
            permissionHandler.resolvePermission(message.toolUseId, message.decision, message.message);

            break;

          default: {
            const _exhaustive: never = message;
            log.warn({ message: _exhaustive }, "Unhandled message type");
            break;
          }
        }
      } catch (error) {
        log.error(error, "Error processing WebSocket message");
        broadcaster.sendTo(socket, {
          type: "error",
          code: "ws_error",
          message: "Failed to process message",
        });
      }
    });

    socket.on("error", (error) => {
      log.error(error, "WebSocket socket error");
    });

    socket.on("close", () => {
      broadcaster.removeClient(socket);
      log.debug("WebSocket client disconnected");
    });
  });
}
