import path from "node:path";
import {
  AGENT_MESSAGE_ROLE,
  AGENT_MESSAGE_TYPE,
  AGENT_TYPE,
  type AgentMessage,
  type AgentType,
  type MessageAnnotation,
} from "@crow-central-agency/shared";
import { loadClaudeCodeSessionMessages, transformClaudeCodeSessionMessage } from "./session-message-transformer.js";
import {
  loadGithubCopilotSessionMessages,
  transformGithubCopilotSessionMessage,
} from "./github-copilot-session-transformer.js";
import { generateId } from "../../utils/id-utils.js";
import { logger } from "../../utils/logger.js";
import { env } from "../../config/env.js";
import { SESSIONS_DIR_NAME, SESSION_AUDIO_DIR_NAME } from "../../config/constants.js";
import { assertWithinBase, readBinaryFile, writeBinaryFile } from "../../utils/fs-utils.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import type { ObjectStoreProvider } from "../../core/store/object-store.types.js";
import type { CopilotClientManager } from "../copilot/copilot-client-manager.js";
import type { AudioMessage } from "../content-generation/content-generation.types.js";
import { isPcmMime } from "../content-generation/audio-format.js";

const log = logger.child({ context: "session-manager" });

export const MESSAGE_ANNOTATIONS_STORE_TABLE = "annotations";

const AUDIO_FILE_EXTENSION = ".bin";

/**
 * Session manager - the sole creator of AgentMessage objects.
 * All SDK SessionMessage → AgentMessage transformation is encapsulated here.
 * Proprietary message annotations (e.g. audio) are stored per-session under
 * `sessions/{sessionId}/...` and merged into AgentMessage on load.
 */
export class SessionManager {
  private messageCache = new Map<string, AgentMessage[]>();

  constructor(
    private readonly store: ObjectStoreProvider,
    private readonly copilotClientManager: CopilotClientManager
  ) {}

  /**
   * Load messages for a session - cache-first, falls back to SDK.
   * Returns AgentMessage[] - the public API never exposes SessionMessage.
   * Stored annotations for the session are merged into the returned messages.
   */
  public async loadMessages(type: AgentType, sessionId: string, cwd: string): Promise<AgentMessage[]> {
    const sessionKey = this.getSessionKey(type, sessionId);
    const cached = this.messageCache.get(sessionKey);
    if (cached) {
      return cached;
    }

    let agentMessages: AgentMessage[];
    switch (type) {
      case AGENT_TYPE.CLAUDE_CODE:
        agentMessages = await loadClaudeCodeSessionMessages(sessionId, cwd);
        break;

      case AGENT_TYPE.GITHUB_COPILOT: {
        // Copilot has no cwd-scoped read API; the shared client locates the session by id alone.
        const copilotClient = this.copilotClientManager.getClient();
        agentMessages = await loadGithubCopilotSessionMessages(copilotClient, sessionId);
        break;
      }
    }

    await this.applyStoredAnnotations(sessionId, agentMessages);
    this.messageCache.set(sessionKey, agentMessages);

    return agentMessages;
  }

  /**
   * Add a message to the session cache.
   * Transforms the SessionMessage into AgentMessage[], appends to cache, and returns the added messages.
   * This is the ONLY way AgentMessages are created during streaming.
   *
   * @param type - The agent type owning the session
   * @param sessionId - The session to add to
   * @param message - SDK SessionMessage (user or assistant)
   * @returns The AgentMessage[] created from this SessionMessage - canonical source for WS broadcast
   */
  public async addMessage(type: AgentType, sessionId: string, cwd: string, message: unknown): Promise<AgentMessage[]> {
    const messages = await this.loadMessages(type, sessionId, cwd);
    const baseTimestamp = messages.length > 0 ? messages[messages.length - 1].timestamp + 1 : 0;
    let agentMessages: AgentMessage[];
    switch (type) {
      case AGENT_TYPE.CLAUDE_CODE:
        agentMessages = transformClaudeCodeSessionMessage(message, baseTimestamp);
        break;

      case AGENT_TYPE.GITHUB_COPILOT:
        agentMessages = transformGithubCopilotSessionMessage(message);
        break;
    }

    messages.push(...agentMessages);
    return agentMessages;
  }

  /**
   * Append a user-authored text message to the session cache.
   * A user message is agent-type agnostic - it maps directly to the canonical AgentMessage model,
   * so it bypasses the provider-specific transform used by `addMessage`. This is an optimistic
   * in-memory echo for the UI; the provider persists its own copy of the turn during the query.
   *
   * @param type - The agent type owning the session (used for cache identity / ordering)
   * @param sessionId - The session to add to
   * @param cwd - The session workspace, used to hydrate the cache
   * @param message - The user's text
   * @returns The created AgentMessage - canonical source for WS broadcast
   */
  public async addUserMessage(type: AgentType, sessionId: string, cwd: string, message: string): Promise<AgentMessage> {
    const messages = await this.loadMessages(type, sessionId, cwd);
    const timestamp = messages.length > 0 ? messages[messages.length - 1].timestamp + 1 : 0;
    const userMessage: AgentMessage = {
      id: generateId(),
      role: AGENT_MESSAGE_ROLE.USER,
      type: AGENT_MESSAGE_TYPE.TEXT,
      content: message,
      timestamp,
    };

    messages.push(userMessage);
    return userMessage;
  }

  /**
   * Attach an audio annotation to an existing message.
   * Persists the audio binary under the session's audio folder and upserts
   * a `MessageAnnotation` record in the annotations table for this session.
   *
   * @returns The cached AgentMessage with the embedded annotation populated.
   */
  public async associateAudioMessage(
    type: AgentType,
    sessionId: string,
    cwd: string,
    messageId: string,
    audioMessage: AudioMessage
  ): Promise<AgentMessage> {
    if (!audioMessage.data) {
      throw new AppError(`Audio message for ${messageId} has no binary data`, APP_ERROR_CODES.AUDIO_GEN_NO_DATA);
    }

    const target = await this.getMessage(type, sessionId, cwd, messageId);
    const audioPath = this.getAudioFilePath(sessionId, messageId);
    await writeBinaryFile(audioPath, audioMessage.data);

    const annotationsTable = this.getAnnotationsTable(sessionId);
    const existing = await this.store.get<MessageAnnotation>(annotationsTable, messageId);
    const annotations: MessageAnnotation = {
      ...existing?.value,
      id: messageId,
      hasAudioMessage: true,
      voiceName: audioMessage.voice,
      audioMimeType: audioMessage.mimeType,
      audioSampleRate: audioMessage.sampleRate,
      durationMs: audioMessage.durationMs,
    };

    await this.store.set(annotationsTable, messageId, annotations);
    target.annotations = this.toEmbeddedAnnotation(annotations);
    return target;
  }

  /**
   * Read the audio binary + annotation metadata for a message and return it as an AudioMessage.
   * Throws NOT_FOUND if the message is unknown, no audio annotation exists, or the binary file is missing.
   */
  public async getAudioMessage(
    type: AgentType,
    sessionId: string,
    cwd: string,
    messageId: string
  ): Promise<AudioMessage> {
    await this.getMessage(type, sessionId, cwd, messageId);

    const annotationsTable = this.getAnnotationsTable(sessionId);
    const entry = await this.store.get<MessageAnnotation>(annotationsTable, messageId);
    if (!entry?.value.hasAudioMessage) {
      throw new AppError(`No audio annotation for message ${messageId}`, APP_ERROR_CODES.NOT_FOUND);
    }

    const data = await readBinaryFile(this.getAudioFilePath(sessionId, messageId));
    return {
      role: "assistant",
      data,
      mimeType: entry.value.audioMimeType,
      sampleRate: entry.value.audioSampleRate,
      durationMs: entry.value.durationMs,
      voice: entry.value.voiceName,
      timestamp: entry.updatedAt,
    };
  }

  /** Get a single cached message by id. Throws NOT_FOUND if the session is not loaded or the id is unknown. */
  public async getMessage(type: AgentType, sessionId: string, cwd: string, messageId: string): Promise<AgentMessage> {
    const messages = await this.loadMessages(type, sessionId, cwd);
    const message = messages.find((entry) => entry.id === messageId);
    if (!message) {
      throw new AppError(`Message ${messageId} not found in session ${sessionId}`, APP_ERROR_CODES.NOT_FOUND);
    }

    return message;
  }

  /** Invalidate cache for a session - called after compact or new session */
  public invalidateCache(type: AgentType, sessionId: string): void {
    const sessionKey = this.getSessionKey(type, sessionId);
    this.messageCache.delete(sessionKey);
    log.debug({ sessionId }, "Cache invalidated");
  }

  /** Merge stored annotations onto freshly transformed messages (mutates in place) */
  private async applyStoredAnnotations(sessionId: string, messages: AgentMessage[]): Promise<void> {
    if (messages.length === 0) {
      return;
    }

    const ids = messages.map((message) => message.id);
    const annotations = await this.store.getMany<MessageAnnotation>(this.getAnnotationsTable(sessionId), ids);
    if (annotations.size === 0) {
      return;
    }

    for (const message of messages) {
      const entry = annotations.get(message.id);
      if (entry) {
        const stored = entry.value;
        const isLegacyPcm = stored.hasAudioMessage === true && isPcmMime(stored.audioMimeType);
        message.annotations = this.toEmbeddedAnnotation(
          isLegacyPcm ? { ...stored, hasAudioMessage: undefined } : stored
        );
      }
    }
  }

  private toEmbeddedAnnotation(stored: MessageAnnotation): Omit<MessageAnnotation, "id"> {
    const { id: _id, ...embedded } = stored;
    return embedded;
  }

  private getAnnotationsTable(sessionId: string): string {
    return `${SESSIONS_DIR_NAME}/${sessionId}/${MESSAGE_ANNOTATIONS_STORE_TABLE}`;
  }

  private getAudioFilePath(sessionId: string, messageId: string): string {
    const sessionsBase = path.join(env.CROW_SYSTEM_PATH, SESSIONS_DIR_NAME);
    const audioDir = path.join(sessionsBase, sessionId, SESSION_AUDIO_DIR_NAME);
    assertWithinBase(audioDir, sessionsBase);
    const filePath = path.join(audioDir, `${messageId}${AUDIO_FILE_EXTENSION}`);
    assertWithinBase(filePath, audioDir);
    return filePath;
  }

  private getSessionKey(type: AgentType, sessionId: string): string {
    return `${type}:${sessionId}`;
  }
}
