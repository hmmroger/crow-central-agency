import { getSessionMessages, getSessionInfo, listSessions } from "@anthropic-ai/claude-agent-sdk";
import type { SessionMessage, SDKSessionInfo } from "@anthropic-ai/claude-agent-sdk";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "session-manager" });

/**
 * In-memory cache backed by SDK session functions.
 * Loads from SDK once, caches in memory, serves subsequent reads from cache.
 * Invalidated on compact or new session.
 */
export class SessionManager {
  private messageCache = new Map<string, SessionMessage[]>();

  /** Load messages for a session — cache-first, falls back to SDK */
  async loadMessages(sessionId: string, cwd: string): Promise<SessionMessage[]> {
    const cached = this.messageCache.get(sessionId);

    if (cached) {
      return cached;
    }

    log.debug({ sessionId }, "Cache miss — loading messages from SDK");
    const messages = await getSessionMessages(sessionId, { dir: cwd });
    this.messageCache.set(sessionId, messages);

    return messages;
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

  /** Append a message to the cache (called during streaming to keep REST reads current) */
  appendToCache(sessionId: string, message: SessionMessage): void {
    const cached = this.messageCache.get(sessionId);

    if (cached) {
      cached.push(message);
    }
  }
}
