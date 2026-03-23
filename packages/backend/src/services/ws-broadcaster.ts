import type { WebSocket } from "ws";
import type { ServerMessage } from "@crow-central-agency/shared";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "ws-broadcaster" });

/**
 * WebSocket pub/sub broadcaster.
 * Maps agentId → Set<WebSocket> for targeted message delivery.
 */
export class WsBroadcaster {
  private subscriptions = new Map<string, Set<WebSocket>>();
  private clientSubscriptions = new WeakMap<WebSocket, Set<string>>();

  /** Subscribe a client to an agent's messages */
  subscribe(ws: WebSocket, agentId: string): void {
    if (!this.subscriptions.has(agentId)) {
      this.subscriptions.set(agentId, new Set());
    }

    const agentSubs = this.subscriptions.get(agentId);
    agentSubs?.add(ws);

    if (!this.clientSubscriptions.has(ws)) {
      this.clientSubscriptions.set(ws, new Set());
    }

    const clientSubs = this.clientSubscriptions.get(ws);
    clientSubs?.add(agentId);

    log.debug({ agentId }, "Client subscribed");
  }

  /** Unsubscribe a client from an agent's messages */
  unsubscribe(ws: WebSocket, agentId: string): void {
    this.subscriptions.get(agentId)?.delete(ws);
    this.clientSubscriptions.get(ws)?.delete(agentId);

    log.debug({ agentId }, "Client unsubscribed");
  }

  /** Remove a client from all subscriptions (on disconnect) */
  removeClient(ws: WebSocket): void {
    const agentIds = this.clientSubscriptions.get(ws);

    if (agentIds) {
      for (const agentId of agentIds) {
        this.subscriptions.get(agentId)?.delete(ws);
      }
    }

    this.clientSubscriptions.delete(ws);
  }

  /** Remove all subscriptions for an agent (on agent deletion) */
  removeAgent(agentId: string): void {
    const clients = this.subscriptions.get(agentId);

    if (clients) {
      for (const ws of clients) {
        this.clientSubscriptions.get(ws)?.delete(agentId);
      }
    }

    this.subscriptions.delete(agentId);
  }

  /** Broadcast a message to all clients subscribed to an agent */
  broadcast(agentId: string, message: ServerMessage): void {
    const clients = this.subscriptions.get(agentId);

    if (!clients || clients.size === 0) {
      return;
    }

    const payload = JSON.stringify(message);
    const staleClients: WebSocket[] = [];

    for (const ws of clients) {
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
  sendTo(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /** Get the number of subscribers for an agent */
  getSubscriberCount(agentId: string): number {
    return this.subscriptions.get(agentId)?.size ?? 0;
  }
}
