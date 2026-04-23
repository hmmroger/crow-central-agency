import path from "node:path";
import {
  AGENT_TASK_SOURCE_TYPE,
  ARTIFACT_CONTENT_TYPE,
  ARTIFACT_TYPE,
  ENTITY_TYPE,
  type AgentTaskSource,
  type ArtifactContentType,
  type ArtifactMetadata,
  type EntityType,
} from "@crow-central-agency/shared";
import {
  assertWithinBase,
  deleteFile,
  ensureDir,
  listFiles,
  readBinaryFile,
  readFileHead,
  statFile,
  writeBinaryFile,
} from "../../utils/fs-utils.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import { env } from "../../config/env.js";
import { AGENTS_DIR_NAME, AGENT_ARTIFACTS_DIR_NAME, CIRCLES_DIR_NAME } from "../../config/constants.js";
import { logger } from "../../utils/logger.js";
import type { ObjectStoreProvider } from "../../core/store/object-store.types.js";
import type { AgentRegistry } from "../agent-registry.js";
import type { AgentCircleManager } from "../agent-circle-manager.js";
import {
  isImageFileExtension,
  isAudioFileExtension,
  isKnownBinaryExtension,
  getMimeTypeByFilename,
  DOCX_MIME_TYPE,
} from "../../utils/mime-type.js";
import type {
  ArtifactAdapter,
  ArtifactListOptions,
  ReadArtifactOptions,
  WriteArtifactOptions,
} from "./artifact-manager.types.js";
import { WordArtifactAdapter } from "./artifact-adapter/word-adapter.js";

const log = logger.child({ context: "artifact-manager" });

/** Maps entity type to its base directory name */
const ENTITY_DIR_NAME: Record<EntityType, string> = {
  [ENTITY_TYPE.AGENT]: AGENTS_DIR_NAME,
  [ENTITY_TYPE.AGENT_CIRCLE]: CIRCLES_DIR_NAME,
};

/** Number of bytes to sample for text/binary detection */
const CONTENT_DETECTION_SAMPLE_SIZE = 256;

/**
 * Manages artifact files for agents and circles.
 * Agent artifacts: agents/{agentId}/artifacts/
 * Circle artifacts: circles/{circleId}/artifacts/
 * Metadata is stored in per-entity object store tables for fast lookup.
 * Path traversal protection on all operations.
 */
export class ArtifactManager {
  // mime type to adapter mapping
  private adapters: Map<string, ArtifactAdapter> = new Map();

  constructor(
    private readonly store: ObjectStoreProvider,
    private readonly registry: AgentRegistry,
    private readonly circleManager: AgentCircleManager
  ) {
    this.adapters.set(DOCX_MIME_TYPE, new WordArtifactAdapter());
  }

  /** Sync artifact metadata with disk for all registered agents and circles: removes stale entries and adds orphan files */
  public async initialize(): Promise<void> {
    const agents = this.registry.getAllAgents(true);
    for (const agent of agents) {
      await this.syncArtifacts(ENTITY_TYPE.AGENT, agent.id);
    }

    const circles = this.circleManager.getAllCircles();
    for (const circle of circles) {
      await this.syncArtifacts(ENTITY_TYPE.AGENT_CIRCLE, circle.id);
    }
  }

  public async listArtifacts(agentId: string, options?: ArtifactListOptions): Promise<ArtifactMetadata[]> {
    return this.listEntityArtifacts(ENTITY_TYPE.AGENT, agentId, options);
  }

  /** Read artifact content. Returns string for TEXT, Buffer for binary content types. */
  public async readArtifact(
    agentId: string,
    filename: string,
    options?: ReadArtifactOptions
  ): Promise<string | Buffer> {
    const [buf, metadata] = await Promise.all([
      this.readEntityArtifact(ENTITY_TYPE.AGENT, agentId, filename),
      this.getEntityArtifactMetadata(ENTITY_TYPE.AGENT, agentId, filename),
    ]);

    if (metadata.contentType === ARTIFACT_CONTENT_TYPE.TEXT) {
      return buf.toString("utf-8");
    }

    if (options?.useAdapter) {
      const convertedContent = await this.tryConvertArtifact(metadata, buf);
      return convertedContent ?? buf;
    }

    return buf;
  }

  /** Write artifact. String content is converted to Buffer (UTF-8) internally. */
  public async writeArtifact(
    agentId: string,
    filename: string,
    content: string | Buffer,
    options: WriteArtifactOptions
  ): Promise<ArtifactMetadata> {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf-8");
    return this.writeEntityArtifact(ENTITY_TYPE.AGENT, agentId, filename, buf, options);
  }

  public async getArtifactMetadata(agentId: string, filename: string): Promise<ArtifactMetadata> {
    return this.getEntityArtifactMetadata(ENTITY_TYPE.AGENT, agentId, filename);
  }

  public async getMostRecentArtifact(agentId: string): Promise<ArtifactMetadata | undefined> {
    return this.getMostRecentEntityArtifact(ENTITY_TYPE.AGENT, agentId);
  }

  public async deleteArtifact(agentId: string, filename: string): Promise<boolean> {
    return this.deleteEntityArtifact(ENTITY_TYPE.AGENT, agentId, filename);
  }

  public async listCircleArtifacts(circleId: string, options?: ArtifactListOptions): Promise<ArtifactMetadata[]> {
    return this.listEntityArtifacts(ENTITY_TYPE.AGENT_CIRCLE, circleId, options);
  }

  /** List all circle artifacts accessible to an agent (from circles the agent is a direct member of) */
  public async listCircleArtifactsForAgent(
    agentId: string,
    options?: ArtifactListOptions
  ): Promise<ArtifactMetadata[]> {
    const circles = this.circleManager.getCirclesForEntity(agentId, ENTITY_TYPE.AGENT);
    const results: ArtifactMetadata[] = [];

    for (const circle of circles) {
      const artifacts = await this.listEntityArtifacts(ENTITY_TYPE.AGENT_CIRCLE, circle.id, options);
      results.push(...artifacts);
    }

    return results;
  }

  /** Read circle artifact content. Returns string for TEXT, Buffer for binary content types. */
  public async readCircleArtifact(
    circleId: string,
    filename: string,
    options?: ReadArtifactOptions
  ): Promise<string | Buffer> {
    const [buf, metadata] = await Promise.all([
      this.readEntityArtifact(ENTITY_TYPE.AGENT_CIRCLE, circleId, filename),
      this.getEntityArtifactMetadata(ENTITY_TYPE.AGENT_CIRCLE, circleId, filename),
    ]);

    if (metadata.contentType === ARTIFACT_CONTENT_TYPE.TEXT) {
      return buf.toString("utf-8");
    }

    if (options?.useAdapter) {
      const convertedContent = await this.tryConvertArtifact(metadata, buf);
      return convertedContent ?? buf;
    }

    return buf;
  }

  /** Write circle artifact. String content is converted to Buffer (UTF-8) internally. */
  public async writeCircleArtifact(
    circleId: string,
    filename: string,
    content: string | Buffer,
    options: WriteArtifactOptions
  ): Promise<ArtifactMetadata> {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf-8");
    return this.writeEntityArtifact(ENTITY_TYPE.AGENT_CIRCLE, circleId, filename, buf, options);
  }

  public async getCircleArtifactMetadata(circleId: string, filename: string): Promise<ArtifactMetadata> {
    return this.getEntityArtifactMetadata(ENTITY_TYPE.AGENT_CIRCLE, circleId, filename);
  }

  public async deleteCircleArtifact(circleId: string, filename: string): Promise<boolean> {
    return this.deleteEntityArtifact(ENTITY_TYPE.AGENT_CIRCLE, circleId, filename);
  }

  /** Check if an agent is a direct member of a circle */
  public isDirectCircleMember(circleId: string, agentId: string): boolean {
    try {
      const members = this.circleManager.getCircleMembers(circleId);
      return members.some((member) => member.entityId === agentId && member.entityType === ENTITY_TYPE.AGENT);
    } catch {
      return false;
    }
  }

  /** Low-level read: always returns Buffer */
  private async readEntityArtifact(entityType: EntityType, entityId: string, filename: string): Promise<Buffer> {
    const filePath = this.getEntityArtifactPath(entityType, entityId, filename);
    return readBinaryFile(filePath);
  }

  /** Low-level write: always operates on Buffer */
  private async writeEntityArtifact(
    entityType: EntityType,
    entityId: string,
    filename: string,
    content: Buffer,
    options: WriteArtifactOptions
  ): Promise<ArtifactMetadata> {
    const filePath = this.getEntityArtifactPath(entityType, entityId, filename);
    await writeBinaryFile(filePath, content);

    const resolvedContentType =
      options.contentType ?? detectContentType(filename, content.subarray(0, CONTENT_DETECTION_SAMPLE_SIZE));
    const now = Date.now();
    const table = this.getStoreTable(entityType, entityId);
    const existing = await this.store.get<ArtifactMetadata>(table, filename);
    const metadata: ArtifactMetadata = {
      filename,
      type: options.type ?? ARTIFACT_TYPE.STANDARD,
      contentType: resolvedContentType,
      entityId,
      entityType,
      size: content.length,
      createdTimestamp: existing?.value.createdTimestamp ?? now,
      updatedTimestamp: now,
      createdBy: existing?.value.createdBy ?? options.createdBy,
    };

    await this.store.set(table, filename, metadata);
    log.info(
      { entityType, entityId, filename, type: metadata.type, contentType: metadata.contentType },
      "Artifact written"
    );

    return metadata;
  }

  private async listEntityArtifacts(
    entityType: EntityType,
    entityId: string,
    options?: ArtifactListOptions
  ): Promise<ArtifactMetadata[]> {
    const table = this.getStoreTable(entityType, entityId);
    const entries = await this.store.getAll<ArtifactMetadata>(table);
    const artifacts = entries.map((entry) => entry.value);
    const filtered = options?.type ? artifacts.filter((artifact) => artifact.type === options.type) : artifacts;
    return filtered.sort((artifactA, artifactB) => artifactB.updatedTimestamp - artifactA.updatedTimestamp);
  }

  private async getEntityArtifactMetadata(
    entityType: EntityType,
    entityId: string,
    filename: string
  ): Promise<ArtifactMetadata> {
    const table = this.getStoreTable(entityType, entityId);
    const entry = await this.store.get<ArtifactMetadata>(table, filename);
    if (!entry) {
      throw new AppError(
        `Artifact metadata not found: ${filename} (${entityType}/${entityId})`,
        APP_ERROR_CODES.NOT_FOUND
      );
    }

    return entry.value;
  }

  private async getMostRecentEntityArtifact(
    entityType: EntityType,
    entityId: string
  ): Promise<ArtifactMetadata | undefined> {
    const artifacts = await this.listEntityArtifacts(entityType, entityId);
    return artifacts[0];
  }

  private async deleteEntityArtifact(entityType: EntityType, entityId: string, filename: string): Promise<boolean> {
    const table = this.getStoreTable(entityType, entityId);
    const deleted = await this.store.delete(table, filename);

    if (deleted) {
      const filePath = this.getEntityArtifactPath(entityType, entityId, filename);
      await deleteFile(filePath);
      log.info({ entityType, entityId, filename }, "Artifact deleted");
    }

    return deleted;
  }

  /** Ensure artifacts folder exists, add orphan files to store, and remove stale metadata */
  private async syncArtifacts(entityType: EntityType, entityId: string): Promise<void> {
    const artifactsDir = this.getEntityArtifactsDir(entityType, entityId);
    await ensureDir(artifactsDir);

    const fileEntries = new Set(await listFiles(artifactsDir));
    const table = this.getStoreTable(entityType, entityId);
    const storeEntries = await this.store.getAll<ArtifactMetadata>(table);

    // Remove metadata for files that no longer exist on disk
    const staleSet = new Set(
      storeEntries.filter((entry) => !fileEntries.has(entry.value.filename)).map((entry) => entry.value.filename)
    );

    if (staleSet.size > 0) {
      const survivors = storeEntries
        .filter((entry) => !staleSet.has(entry.value.filename))
        .map((entry): readonly [string, ArtifactMetadata] => [entry.value.filename, entry.value]);
      await this.store.clear(table);
      if (survivors.length > 0) {
        await this.store.setMany(table, survivors);
      }

      log.info({ entityType, entityId, count: staleSet.size }, "Cleaned up stale artifact metadata");
    }

    // Add metadata for files on disk but not in store
    const storedFilenames = new Set(storeEntries.map((entry) => entry.value.filename));
    const orphans: Array<readonly [string, ArtifactMetadata]> = [];

    for (const filename of fileEntries) {
      if (!storedFilenames.has(filename)) {
        const filePath = path.join(artifactsDir, filename);
        const [stat, sample] = await Promise.all([
          statFile(filePath),
          readFileHead(filePath, CONTENT_DETECTION_SAMPLE_SIZE),
        ]);
        const now = Date.now();
        const createdBy: AgentTaskSource =
          entityType === ENTITY_TYPE.AGENT
            ? { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId: entityId }
            : { sourceType: AGENT_TASK_SOURCE_TYPE.SYSTEM };
        orphans.push([
          filename,
          {
            filename,
            type: ARTIFACT_TYPE.STANDARD,
            contentType: detectContentType(filename, sample),
            entityId,
            entityType,
            size: stat.size,
            createdTimestamp: now,
            updatedTimestamp: now,
            createdBy,
          },
        ]);
      }
    }

    if (orphans.length > 0) {
      await this.store.setMany(table, orphans);
      log.info({ entityType, entityId, count: orphans.length }, "Synced orphan artifacts to store");
    }
  }

  private getStoreTable(entityType: EntityType, entityId: string): string {
    return `${ENTITY_DIR_NAME[entityType]}/${entityId}/artifacts`;
  }

  private getBaseDir(entityType: EntityType): string {
    return path.join(env.CROW_SYSTEM_PATH, ENTITY_DIR_NAME[entityType]);
  }

  private getEntityArtifactsDir(entityType: EntityType, entityId: string): string {
    const baseDir = this.getBaseDir(entityType);
    const entityDir = path.join(baseDir, entityId);
    assertWithinBase(entityDir, baseDir);

    return path.join(entityDir, AGENT_ARTIFACTS_DIR_NAME);
  }

  private getEntityArtifactPath(entityType: EntityType, entityId: string, filename: string): string {
    const artifactsDir = this.getEntityArtifactsDir(entityType, entityId);
    const filePath = path.join(artifactsDir, filename);
    assertWithinBase(filePath, artifactsDir);

    return filePath;
  }

  private async tryConvertArtifact(metadata: ArtifactMetadata, artifactInput: Buffer): Promise<string | undefined> {
    const mimeType = getMimeTypeByFilename(metadata.filename);
    if (!mimeType) {
      return undefined;
    }

    try {
      const adapter = this.adapters.get(mimeType);
      const output = await adapter?.convertArtifact(artifactInput);
      return output;
    } catch (error) {
      log.error({ filename: metadata.filename, mimeType, error }, "Artifact conversion failed");
      return undefined;
    }
  }
}

/** Check if a buffer looks like text content by examining bytes for binary indicators */
function isTextContent(sample: Buffer): boolean {
  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    // Null byte is a strong binary indicator
    if (byte === 0x00) {
      return false;
    }

    // Non-text control characters (excluding tab, LF, CR, form-feed, backspace, ESC)
    if (byte < 0x08 || (byte > 0x0d && byte < 0x1b) || byte === 0x7f) {
      return false;
    }
  }

  return true;
}

/**
 * Detect content type from filename extension and content bytes.
 * 1. Check extension for known image/audio types
 * 2. Check extension for other known binary types (pdf, etc.)
 * 3. Examine content bytes: if text -> TEXT
 * 4. Otherwise -> BINARY
 */
function detectContentType(filename: string, sample: Buffer): ArtifactContentType {
  const ext = path.extname(filename).toLowerCase();

  if (isImageFileExtension(ext)) {
    return ARTIFACT_CONTENT_TYPE.IMAGE;
  }

  if (isAudioFileExtension(ext)) {
    return ARTIFACT_CONTENT_TYPE.AUDIO;
  }

  if (isKnownBinaryExtension(ext)) {
    return ARTIFACT_CONTENT_TYPE.BINARY;
  }

  if (isTextContent(sample)) {
    return ARTIFACT_CONTENT_TYPE.TEXT;
  }

  return ARTIFACT_CONTENT_TYPE.BINARY;
}
