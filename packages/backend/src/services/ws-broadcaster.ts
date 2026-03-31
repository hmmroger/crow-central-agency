import type { WebSocket } from "ws";
import type { ServerMessage } from "@crow-central-agency/shared";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "ws-broadcaster" });

/**
 * WebSocket broadcaster - sends messages to all connected clients.
 * No per-agent subscription filtering; all connected clients receive all messages.
 * Client-side handlers filter by agentId.
 */
export class WsBroadcaster {
  private clients = new Set<WebSocket>();

  /** Register a client on connect */
  public addClient(ws: WebSocket): void {
    this.clients.add(ws);
    log.debug("Client added");
  }

  /** Remove a client on disconnect */
  public removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
    log.debug("Client removed");
  }

  /** Broadcast a message to all connected clients */
  public broadcast(message: ServerMessage): void {
    if (this.clients.size === 0) {
      return;
    }

    const payload = JSON.stringify(message);
    const staleClients: WebSocket[] = [];

    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload);
      } else if (ws.readyState !== ws.CONNECTING) {
        staleClients.push(ws);
      }
    }

    // Evict non-recoverable sockets to prevent unbounded set growth
    for (const ws of staleClients) {
      this.removeClient(ws);
    }
  }

  /** Send a message directly to a specific client */
  public sendTo(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /** Get the number of connected clients */
  public getClientCount(): number {
    return this.clients.size;
  }
}
