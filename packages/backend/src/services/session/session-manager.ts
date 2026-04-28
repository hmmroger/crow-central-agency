import path from "node:path";
import { getSessionMessages, getSessionInfo, listSessions } from "@anthropic-ai/claude-agent-sdk";
import type { SessionMessage, SDKSessionInfo } from "@anthropic-ai/claude-agent-sdk";
import type { AgentMessage, MessageAnnotation } from "@crow-central-agency/shared";
import { transformSessionMessages, transformSingleMessage } from "./session-message-transformer.js";
import { logger } from "../../utils/logger.js";
import { env } from "../../config/env.js";
import { SESSIONS_DIR_NAME, SESSION_AUDIO_DIR_NAME } from "../../config/constants.js";
import { assertWithinBase, readBinaryFile, writeBinaryFile } from "../../utils/fs-utils.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import type { ObjectStoreProvider } from "../../core/store/object-store.types.js";
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

  constructor(private readonly store: ObjectStoreProvider) {}

  /**
   * Load messages for a session - cache-first, falls back to SDK.
   * Returns AgentMessage[] - the public API never exposes SessionMessage.
   * Stored annotations for the session are merged into the returned messages.
   */
  public async loadMessages(sessionId: string, cwd: string): Promise<AgentMessage[]> {
    const cached = this.messageCache.get(sessionId);
    if (cached) {
      return cached;
    }

    log.debug({ sessionId }, "Cache miss - loading messages from SDK");
    const rawMessages = await getSessionMessages(sessionId, { dir: cwd });
    const agentMessages = transformSessionMessages(rawMessages);
    await this.applyStoredAnnotations(sessionId, agentMessages);
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
   * @returns The AgentMessage[] created from this SessionMessage - canonical source for WS broadcast
   */
  public addMessage(sessionId: string, message: SessionMessage): AgentMessage[] {
    let cached = this.messageCache.get(sessionId);
    if (!cached) {
      cached = [];
      this.messageCache.set(sessionId, cached);
    }

    const baseTimestamp = cached.length > 0 ? cached[cached.length - 1].timestamp + 1 : 0;
    const agentMessages = transformSingleMessage(message, baseTimestamp);
    cached.push(...agentMessages);

    return agentMessages;
  }

  /**
   * Attach an audio annotation to an existing message.
   * Persists the audio binary under the session's audio folder and upserts
   * a `MessageAnnotation` record in the annotations table for this session.
   *
   * @returns The cached AgentMessage with the embedded annotation populated.
   */
  public async associateAudioMessage(
    sessionId: string,
    messageId: string,
    audioMessage: AudioMessage
  ): Promise<AgentMessage> {
    if (!audioMessage.data) {
      throw new AppError(`Audio message for ${messageId} has no binary data`, APP_ERROR_CODES.AUDIO_GEN_NO_DATA);
    }

    const target = this.getMessage(sessionId, messageId);
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
   * Throws NOT_FOUND if no audio annotation exists or the binary file is missing.
   */
  public async getAudioMessage(sessionId: string, messageId: string): Promise<AudioMessage> {
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
  public getMessage(sessionId: string, messageId: string): AgentMessage {
    const cached = this.messageCache.get(sessionId);
    if (!cached) {
      throw new AppError(`Session ${sessionId} is not loaded`, APP_ERROR_CODES.NOT_FOUND);
    }

    const message = cached.find((entry) => entry.id === messageId);
    if (!message) {
      throw new AppError(`Message ${messageId} not found in session ${sessionId}`, APP_ERROR_CODES.NOT_FOUND);
    }

    return message;
  }

  /** Get session info from SDK (not cached - lightweight call) */
  public async getInfo(sessionId: string, cwd: string): Promise<SDKSessionInfo | undefined> {
    return getSessionInfo(sessionId, { dir: cwd });
  }

  /** List all sessions for a workspace */
  public async listSessions(cwd: string): Promise<SDKSessionInfo[]> {
    return listSessions({ dir: cwd });
  }

  /** Invalidate cache for a session - called after compact or new session */
  public invalidateCache(sessionId: string): void {
    this.messageCache.delete(sessionId);
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
}
