import path from "node:path";
import {
  ARTIFACT_CONTENT_TYPE,
  ARTIFACT_TYPE,
  ENTITY_TYPE,
  type ArtifactMetadata,
  type EntityType,
} from "@crow-central-agency/shared";
import {
  assertWithinBase,
  deleteFile,
  ensureDir,
  isPathExists,
  readBinaryFile,
  renameFile,
  writeBinaryFile,
} from "../../utils/fs-utils.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import { env } from "../../config/env.js";
import { AGENTS_DIR_NAME, AGENT_ARTIFACTS_DIR_NAME, CIRCLES_DIR_NAME } from "../../config/constants.js";
import { generateId } from "../../utils/id-utils.js";
import { logger } from "../../utils/logger.js";
import type { ObjectStoreProvider } from "../../core/store/object-store.types.js";
import type { AgentRegistry } from "../agent-registry.js";
import type { AgentCircleManager } from "../agent-circle-manager.js";
import { getMimeTypeByFilename, DOCX_MIME_TYPE } from "../../utils/mime-type.js";
import type {
  ArtifactAdapter,
  ArtifactListOptions,
  ReadArtifactOptions,
  WriteArtifactOptions,
} from "./artifact-manager.types.js";
import { WordArtifactAdapter } from "./artifact-adapter/word-adapter.js";
import {
  normalizeArtifactFilename,
  pickAvailableFilename,
  safeNormalizeArtifactFilename,
} from "./artifact-filename.js";
import { detectArtifactContentType } from "./artifact-content-detector.js";

const log = logger.child({ context: "artifact-manager" });

/** Maps entity type to its base directory name */
const ENTITY_DIR_NAME: Record<EntityType, string> = {
  [ENTITY_TYPE.AGENT]: AGENTS_DIR_NAME,
  [ENTITY_TYPE.AGENT_CIRCLE]: CIRCLES_DIR_NAME,
};

/** Number of bytes to sample for text/binary detection */
const CONTENT_DETECTION_SAMPLE_SIZE = 256;

/**
 * Pre-id-field legacy metadata shape. Only used while migrating older
 * deployments where entries lack the `id` field and the on-disk file is
 * still named after the (possibly un-normalized) filename.
 */
type MaybeLegacyArtifactMetadata = Omit<ArtifactMetadata, "id"> & { id?: string };

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

  /** Migrate legacy artifacts, then prune entries whose disk file is missing, for every registered agent and circle */
  public async initialize(): Promise<void> {
    const agents = this.registry.getAllAgents(true);
    for (const agent of agents) {
      await this.migrateAndSync(ENTITY_TYPE.AGENT, agent.id);
    }

    const circles = this.circleManager.getAllCircles();
    for (const circle of circles) {
      await this.migrateAndSync(ENTITY_TYPE.AGENT_CIRCLE, circle.id);
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
    return this.readEntityArtifact(ENTITY_TYPE.AGENT, agentId, filename, options);
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
    return this.readEntityArtifact(ENTITY_TYPE.AGENT_CIRCLE, circleId, filename, options);
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

  private async readEntityArtifact(
    entityType: EntityType,
    entityId: string,
    filename: string,
    options?: ReadArtifactOptions
  ): Promise<string | Buffer> {
    const metadata = await this.getEntityArtifactMetadata(entityType, entityId, filename);
    const filePath = this.getEntityArtifactPath(entityType, entityId, metadata.id);
    const buf = await readBinaryFile(filePath);

    if (metadata.contentType === ARTIFACT_CONTENT_TYPE.TEXT) {
      return buf.toString("utf-8");
    }

    if (options?.useAdapter) {
      const convertedContent = await this.tryConvertArtifact(metadata, buf);
      return convertedContent ?? buf;
    }

    return buf;
  }

  /** Write an artifact end-to-end: normalize, mint/reuse id, write disk by id, set metadata. */
  private async writeEntityArtifact(
    entityType: EntityType,
    entityId: string,
    filename: string,
    content: Buffer,
    options: WriteArtifactOptions
  ): Promise<ArtifactMetadata> {
    const normalizedFilename = normalizeArtifactFilename(filename);
    const table = this.getStoreTable(entityType, entityId);
    const existing = await this.store.get<ArtifactMetadata>(table, normalizedFilename);
    const id = existing?.value.id ?? generateId();
    const filePath = this.getEntityArtifactPath(entityType, entityId, id);
    await writeBinaryFile(filePath, content);

    const resolvedContentType =
      options.contentType ??
      detectArtifactContentType(normalizedFilename, content.subarray(0, CONTENT_DETECTION_SAMPLE_SIZE));
    const now = Date.now();
    const metadata: ArtifactMetadata = {
      id,
      filename: normalizedFilename,
      type: options.type ?? ARTIFACT_TYPE.STANDARD,
      contentType: resolvedContentType,
      entityId,
      entityType,
      size: content.length,
      createdTimestamp: existing?.value.createdTimestamp ?? now,
      updatedTimestamp: now,
      createdBy: existing?.value.createdBy ?? options.createdBy,
    };

    await this.store.set(table, normalizedFilename, metadata);
    log.info(
      {
        entityType,
        entityId,
        filename: normalizedFilename,
        id,
        type: metadata.type,
        contentType: metadata.contentType,
      },
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
    const normalizedFilename = normalizeArtifactFilename(filename);
    const table = this.getStoreTable(entityType, entityId);
    const entry = await this.store.get<ArtifactMetadata>(table, normalizedFilename);
    if (!entry) {
      throw new AppError(
        `Artifact metadata not found: ${normalizedFilename} (${entityType}/${entityId})`,
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
    const normalizedFilename = normalizeArtifactFilename(filename);
    const table = this.getStoreTable(entityType, entityId);
    const existing = await this.store.get<ArtifactMetadata>(table, normalizedFilename);
    if (!existing) {
      return false;
    }

    const deleted = await this.store.delete(table, normalizedFilename);
    if (deleted) {
      const filePath = this.getEntityArtifactPath(entityType, entityId, existing.value.id);
      await deleteFile(filePath);
      log.info({ entityType, entityId, filename: normalizedFilename, id: existing.value.id }, "Artifact deleted");
    }

    return deleted;
  }

  /** Migrate legacy entries (if any) and remove entries whose backing file no longer exists. */
  private async migrateAndSync(entityType: EntityType, entityId: string): Promise<void> {
    const artifactsDir = this.getEntityArtifactsDir(entityType, entityId);
    await ensureDir(artifactsDir);

    await this.migrateLegacyArtifacts(entityType, entityId, artifactsDir);
    await this.removeStaleArtifactEntries(entityType, entityId, artifactsDir);
  }

  /**
   * One-shot migration for entries written before the id/normalization refactor.
   * Each legacy entry was stored with the (possibly un-normalized) filename as
   * both the store key and the on-disk filename. This walks every entry, mints
   * a UUID for any without `id`, renames the disk file to `<id>`, and rewrites
   * the store entry under the normalized filename.
   */
  private async migrateLegacyArtifacts(entityType: EntityType, entityId: string, artifactsDir: string): Promise<void> {
    const table = this.getStoreTable(entityType, entityId);
    const entries = await this.store.getAll<MaybeLegacyArtifactMetadata>(table);
    const needsMigration = entries.some(
      (entry) => !entry.value.id || entry.value.filename !== safeNormalizeArtifactFilename(entry.value.filename)
    );
    if (!needsMigration) {
      return;
    }

    const takenNames = new Set<string>();
    const newEntries: Array<readonly [string, ArtifactMetadata]> = [];
    let droppedCount = 0;

    for (const entry of entries) {
      const legacyKey = entry.value.filename;
      // The actual on-disk name is the entry's id if it already has one
      // (partial prior migration), otherwise the raw filename.
      const legacyDiskName = entry.value.id ?? legacyKey;
      const normalized = safeNormalizeArtifactFilename(legacyKey);
      if (!normalized) {
        droppedCount += 1;
        continue;
      }

      const uniqNormalizedFilename = pickAvailableFilename(normalized, takenNames);
      if (!uniqNormalizedFilename) {
        droppedCount += 1;
        continue;
      }

      takenNames.add(uniqNormalizedFilename);
      const id = entry.value.id ?? generateId();
      const oldDiskPath = path.join(artifactsDir, legacyDiskName);
      const newDiskPath = path.join(artifactsDir, id);
      if (oldDiskPath !== newDiskPath) {
        await renameFile(oldDiskPath, newDiskPath);
      }

      const migrated: ArtifactMetadata = {
        ...entry.value,
        id,
        filename: uniqNormalizedFilename,
      };
      newEntries.push([uniqNormalizedFilename, migrated]);
    }

    await this.store.clear(table);
    if (newEntries.length > 0) {
      await this.store.setMany(table, newEntries);
    }

    log.info(
      { entityType, entityId, count: newEntries.length, dropped: droppedCount },
      "Migrated legacy artifacts to id-based storage"
    );
  }

  private async removeStaleArtifactEntries(
    entityType: EntityType,
    entityId: string,
    artifactsDir: string
  ): Promise<void> {
    const table = this.getStoreTable(entityType, entityId);
    const entries = await this.store.getAll<ArtifactMetadata>(table);
    const staleKeys: string[] = [];

    for (const entry of entries) {
      const filePath = path.join(artifactsDir, entry.value.id);
      const exists = await isPathExists(filePath);
      if (!exists) {
        staleKeys.push(entry.value.filename);
      }
    }

    if (staleKeys.length === 0) {
      return;
    }

    const survivors = entries
      .filter((entry) => !staleKeys.includes(entry.value.filename))
      .map((entry): readonly [string, ArtifactMetadata] => [entry.value.filename, entry.value]);

    await this.store.clear(table);
    if (survivors.length > 0) {
      await this.store.setMany(table, survivors);
    }

    log.info({ entityType, entityId, count: staleKeys.length }, "Cleaned up stale artifact metadata");
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

  private getEntityArtifactPath(entityType: EntityType, entityId: string, id: string): string {
    const artifactsDir = this.getEntityArtifactsDir(entityType, entityId);
    const filePath = path.join(artifactsDir, id);
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
