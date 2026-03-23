import { getSessionMessages, getSessionInfo, listSessions } from "@anthropic-ai/claude-agent-sdk";
import type { SessionMessage, SDKSessionInfo } from "@anthropic-ai/claude-agent-sdk";
import type { AgentMessage } from "@crow-central-agency/shared";
import { transformSessionMessages, transformSingleMessage } from "./session-message-transformer.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "session-manager" });

/**
 * Session manager — the sole creator of AgentMessage objects.
 * All SDK SessionMessage → AgentMessage transformation is encapsulated here.
 *
 * Maintains an in-memory AgentMessage cache per session.
 * On cache miss, loads from SDK via getSessionMessages(), transforms, and caches.
 * During streaming, the orchestrator calls addMessage() with SessionMessages
 * to keep the cache current.
 */
export class SessionManager {
  private messageCache = new Map<string, AgentMessage[]>();

  /**
   * Load messages for a session — cache-first, falls back to SDK.
   * Returns AgentMessage[] — the public API never exposes SessionMessage.
   */
  async loadMessages(sessionId: string, cwd: string): Promise<AgentMessage[]> {
    const cached = this.messageCache.get(sessionId);

    if (cached) {
      return cached;
    }

    log.debug({ sessionId }, "Cache miss — loading messages from SDK");
    const rawMessages = await getSessionMessages(sessionId, { dir: cwd });
    const agentMessages = transformSessionMessages(rawMessages);
    this.messageCache.set(sessionId, agentMessages);

    return agentMessages;
  }

  /**
   * Add a message to the session cache.
   * Transforms the SessionMessage into AgentMessage[], appends to cache, and returns the added messages.
   * This is the ONLY way AgentMessages are created during streaming.
   *
   * @param sessionId - The session to add to
   * @param message - SDK SessionMessage (user or assistant)
   * @returns The AgentMessage[] created from this SessionMessage — canonical source for WS broadcast
   */
  addMessage(sessionId: string, message: SessionMessage): AgentMessage[] {
    let cached = this.messageCache.get(sessionId);

    if (!cached) {
      cached = [];
      this.messageCache.set(sessionId, cached);
    }

    const baseTimestamp = cached.length > 0 ? cached[cached.length - 1].timestamp + 1 : Date.now();
    const agentMessages = transformSingleMessage(message, baseTimestamp);
    cached.push(...agentMessages);

    return agentMessages;
  }

  /** Get session info from SDK (not cached — lightweight call) */
  async getInfo(sessionId: string, cwd: string): Promise<SDKSessionInfo | undefined> {
    return getSessionInfo(sessionId, { dir: cwd });
  }

  /** List all sessions for a workspace */
  async listSessions(cwd: string): Promise<SDKSessionInfo[]> {
    return listSessions({ dir: cwd });
  }

  /** Invalidate cache for a session — called after compact or new session */
  invalidateCache(sessionId: string): void {
    this.messageCache.delete(sessionId);
    log.debug({ sessionId }, "Cache invalidated");
  }
}
