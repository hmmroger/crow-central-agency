import type { FastifyInstance } from "fastify";
import { ClientMessageSchema } from "@crow-central-agency/shared";
import type { WsBroadcaster } from "../services/ws-broadcaster.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "websocket" });

/**
 * Set up WebSocket endpoint with message routing.
 * Handles subscribe/unsubscribe for agent-level pub/sub.
 */
export async function setupWebSocket(server: FastifyInstance, broadcaster: WsBroadcaster) {
  server.get("/ws", { websocket: true }, (socket) => {
    log.debug("WebSocket client connected");

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
          case "subscribe":
            broadcaster.subscribe(socket, message.agentId);
            break;

          case "unsubscribe":
            broadcaster.unsubscribe(socket, message.agentId);
            break;

          // Phase 2 will add: send_message, btw_message
          // Phase 3 will add: permission_response

          default:
            log.warn({ type: (message as { type: string }).type }, "Unhandled message type");
            break;
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

    socket.on("close", () => {
      broadcaster.removeClient(socket);
      log.debug("WebSocket client disconnected");
    });
  });
}
