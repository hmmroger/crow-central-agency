import path from "node:path";
import fs from "node:fs/promises";
import { env } from "../config/env.js";
import { AGENTS_DIR_NAME, MESSAGE_QUEUE_FILENAME } from "../config/constants.js";
import { readJsonFile, writeJsonFile, assertWithinBase } from "../utils/fs-utils.js";
import { generateId } from "../utils/id-utils.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../error/app-error.js";
import { APP_ERROR_CODES } from "../error/app-error.types.js";
import type { QueuedMessage, MessageSource } from "./message-queue-manager.types.js";

const log = logger.child({ context: "message-queue" });

/**
 * File-based message queue for agents.
 * Persists queued messages to `<agent_folder>/message-queue.json`.
 * Uses per-agent Promise chains to serialize concurrent file I/O.
 */
export class MessageQueueManager {
  private readonly agentsBaseDir: string;
  /** Per-agent Promise chain to serialize read-modify-write operations */
  private readonly opChains = new Map<string, Promise<void>>();

  constructor() {
    this.agentsBaseDir = path.join(env.CROW_SYSTEM_PATH, AGENTS_DIR_NAME);
  }

  /**
   * Append a message to the agent's queue.
   * @returns The created queue entry.
   */
  public async enqueue(agentId: string, message: string, source: MessageSource): Promise<QueuedMessage> {
    const entry: QueuedMessage = {
      id: generateId(),
      message,
      enqueuedAt: new Date().toISOString(),
      source,
    };

    await this.serialized(agentId, async () => {
      const messages = await this.readQueue(agentId);
      messages.push(entry);
      await writeJsonFile(this.getQueueFilePath(agentId), messages);
    });

    log.info({ agentId, queueEntryId: entry.id, source }, "Message enqueued");
    return entry;
  }

  /**
   * Remove and return the first message from the agent's queue.
   * Deletes the queue file when the last message is dequeued.
   */
  public async dequeue(agentId: string): Promise<QueuedMessage | undefined> {
    let entry: QueuedMessage | undefined;

    await this.serialized(agentId, async () => {
      const messages = await this.readQueue(agentId);
      if (messages.length === 0) {
        return;
      }

      entry = messages.shift();

      if (messages.length === 0) {
        await this.deleteQueueFile(agentId);
      } else {
        await writeJsonFile(this.getQueueFilePath(agentId), messages);
      }
    });

    return entry;
  }

  /** Read the first message without removing it */
  public async peek(agentId: string): Promise<QueuedMessage | undefined> {
    const messages = await this.readQueue(agentId);
    return messages[0];
  }

  /** Get the number of queued messages */
  public async size(agentId: string): Promise<number> {
    const messages = await this.readQueue(agentId);
    return messages.length;
  }

  /** Remove all queued messages for an agent */
  public async clear(agentId: string): Promise<void> {
    await this.serialized(agentId, async () => {
      await this.deleteQueueFile(agentId);
    });

    log.info({ agentId }, "Message queue cleared");
  }

  /** Get the queue file path with traversal protection */
  private getQueueFilePath(agentId: string): string {
    const agentDir = path.join(this.agentsBaseDir, agentId);
    assertWithinBase(agentDir, this.agentsBaseDir);
    return path.join(agentDir, MESSAGE_QUEUE_FILENAME);
  }

  /** Read the queue file, returning an empty array if it doesn't exist */
  private async readQueue(agentId: string): Promise<QueuedMessage[]> {
    try {
      return await readJsonFile<QueuedMessage[]>(this.getQueueFilePath(agentId));
    } catch (error) {
      if (error instanceof AppError && error.errorCode === APP_ERROR_CODES.NOT_FOUND) {
        return [];
      }

      throw error;
    }
  }

  /** Delete the queue file (no-op if it doesn't exist) */
  private async deleteQueueFile(agentId: string): Promise<void> {
    try {
      await fs.rm(this.getQueueFilePath(agentId), { force: true });
    } catch (error) {
      log.warn({ agentId, error }, "Failed to delete queue file");
    }
  }

  /**
   * Serialize an async operation per-agent using a Promise chain.
   * Ensures read-modify-write cycles don't interleave for the same agent.
   * Self-cleans the chain entry when no further operations are queued.
   */
  private async serialized(agentId: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.opChains.get(agentId) ?? Promise.resolve();

    const next = previous.then(operation, operation).finally(() => {
      // Clean up if this is still the tail of the chain (no new ops queued after us)
      if (this.opChains.get(agentId) === next) {
        this.opChains.delete(agentId);
      }
    });
    this.opChains.set(agentId, next);

    await next;
  }
}
