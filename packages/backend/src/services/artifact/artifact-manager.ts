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
import { EventBus } from "../../core/event-bus/event-bus.js";
import type {
  ArtifactAdapter,
  ArtifactContentFindResult,
  ArtifactContentMatch,
  ArtifactListOptions,
  ArtifactLocation,
  ArtifactManagerEvents,
  MoveArtifactOptions,
  ReadArtifactOptions,
  ReadArtifactResult,
  UpdateArtifactOptions,
  WriteArtifactOptions,
} from "./artifact-manager.types.js";
import { WordArtifactAdapter } from "./artifact-adapter/word-adapter.js";
import {
  normalizeArtifactFilename,
  pickAvailableFilename,
  safeNormalizeArtifactFilename,
} from "./artifact-filename.js";
import { detectArtifactContentType } from "./artifact-content-detector.js";
import { normalizeTags } from "./artifact-tags.js";

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
export class ArtifactManager extends EventBus<ArtifactManagerEvents> {
  // mime type to adapter mapping
  private adapters: Map<string, ArtifactAdapter> = new Map();

  constructor(
    private readonly store: ObjectStoreProvider,
    private readonly registry: AgentRegistry,
    private readonly circleManager: AgentCircleManager
  ) {
    super();
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

  /** Read artifact content and metadata. Content is string for TEXT, Buffer for binary types. */
  public async readArtifact(
    agentId: string,
    filename: string,
    options?: ReadArtifactOptions
  ): Promise<ReadArtifactResult> {
    return this.readEntityArtifact(ENTITY_TYPE.AGENT, agentId, filename, options);
  }

  /** Write artifact (upsert). Replaces content and metadata; tags fully replace (omit = no tags). */
  public async writeArtifact(
    agentId: string,
    filename: string,
    content: string | Buffer,
    options: WriteArtifactOptions
  ): Promise<ArtifactMetadata> {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf-8");
    return this.writeEntityArtifact(ENTITY_TYPE.AGENT, agentId, filename, buf, options);
  }

  /** Update artifact in place: rename, replace content, and/or adjust tags. */
  public async updateArtifact(
    agentId: string,
    filename: string,
    options: UpdateArtifactOptions
  ): Promise<ArtifactMetadata> {
    return this.updateEntityArtifact(ENTITY_TYPE.AGENT, agentId, filename, options);
  }

  /** Find lines in a TEXT artifact matching a substring query. Case-insensitive. */
  public async findArtifactContent(
    agentId: string,
    filename: string,
    query: string,
    startLine?: number
  ): Promise<ArtifactContentFindResult> {
    return this.findEntityArtifactContent(ENTITY_TYPE.AGENT, agentId, filename, query, startLine);
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

    return results.sort((artifactA, artifactB) => artifactB.updatedTimestamp - artifactA.updatedTimestamp);
  }

  /** Read circle artifact content and metadata. Content is string for TEXT, Buffer for binary types. */
  public async readCircleArtifact(
    circleId: string,
    filename: string,
    options?: ReadArtifactOptions
  ): Promise<ReadArtifactResult> {
    return this.readEntityArtifact(ENTITY_TYPE.AGENT_CIRCLE, circleId, filename, options);
  }

  /** Write circle artifact (upsert). Replaces content and metadata; tags fully replace (omit = no tags). */
  public async writeCircleArtifact(
    circleId: string,
    filename: string,
    content: string | Buffer,
    options: WriteArtifactOptions
  ): Promise<ArtifactMetadata> {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf-8");
    return this.writeEntityArtifact(ENTITY_TYPE.AGENT_CIRCLE, circleId, filename, buf, options);
  }

  /** Update circle artifact in place: rename, replace content, and/or adjust tags. */
  public async updateCircleArtifact(
    circleId: string,
    filename: string,
    options: UpdateArtifactOptions
  ): Promise<ArtifactMetadata> {
    return this.updateEntityArtifact(ENTITY_TYPE.AGENT_CIRCLE, circleId, filename, options);
  }

  /** Find lines in a TEXT circle artifact matching a substring query. Case-insensitive. */
  public async findCircleArtifactContent(
    circleId: string,
    filename: string,
    query: string,
    startLine?: number
  ): Promise<ArtifactContentFindResult> {
    return this.findEntityArtifactContent(ENTITY_TYPE.AGENT_CIRCLE, circleId, filename, query, startLine);
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

  public async moveArtifact(
    source: ArtifactLocation,
    destination: ArtifactLocation,
    filename: string,
    options: MoveArtifactOptions
  ): Promise<ArtifactMetadata> {
    if (source.entityType === destination.entityType && source.entityId === destination.entityId) {
      throw new AppError("Source and destination are the same location; nothing to move.", APP_ERROR_CODES.VALIDATION);
    }

    const sourceMetadata = await this.getEntityArtifactMetadata(source.entityType, source.entityId, filename);
    const sourcePath = this.getEntityArtifactPath(source.entityType, source.entityId, sourceMetadata.id);
    const content = await readBinaryFile(sourcePath);

    const destinationFilename = normalizeArtifactFilename(options.destinationFilename ?? sourceMetadata.filename);
    const destinationTable = this.getStoreTable(destination.entityType, destination.entityId);
    const existingDestination = await this.store.get<ArtifactMetadata>(destinationTable, destinationFilename);
    if (existingDestination) {
      throw new AppError(
        `An artifact named ${destinationFilename} already exists at the destination. Move it under a different destination_filename or delete the existing artifact first.`,
        APP_ERROR_CODES.CONFLICT
      );
    }

    const destinationMetadata = await this.writeEntityArtifact(
      destination.entityType,
      destination.entityId,
      destinationFilename,
      content,
      {
        contentType: sourceMetadata.contentType,
        type: sourceMetadata.type,
        tags: sourceMetadata.tags,
        createdBy: options.movedBy,
      }
    );

    try {
      await this.deleteEntityArtifact(source.entityType, source.entityId, filename);
    } catch (error) {
      throw new AppError(
        `Artifact was written to the destination as ${destinationFilename}, but removing the source copy failed; remove it manually. Cause: ${error instanceof Error ? error.message : String(error)}`,
        APP_ERROR_CODES.UNKNOWN
      );
    }

    return destinationMetadata;
  }

  private async readEntityArtifact(
    entityType: EntityType,
    entityId: string,
    filename: string,
    options?: ReadArtifactOptions
  ): Promise<ReadArtifactResult> {
    const metadata = await this.getEntityArtifactMetadata(entityType, entityId, filename);
    const filePath = this.getEntityArtifactPath(entityType, entityId, metadata.id);
    const buf = await readBinaryFile(filePath);

    if (metadata.contentType === ARTIFACT_CONTENT_TYPE.TEXT) {
      return { content: buf.toString("utf-8"), metadata };
    }

    if (options?.useAdapter) {
      const convertedContent = await this.tryConvertArtifact(metadata, buf);
      return { content: convertedContent ?? buf, metadata };
    }

    return { content: buf, metadata };
  }

  /**
   * Write an artifact end-to-end (upsert): normalize, reuse or mint id, write disk by id, set metadata.
   * If the artifact already exists, content and metadata are replaced; id, createdTimestamp, and createdBy
   * are preserved.
   */
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
      tags: normalizeTags(options.tags),
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
        replaced: existing !== undefined,
      },
      "Artifact written"
    );

    this.emit("artifactSaved", { metadata });
    return metadata;
  }

  /**
   * Update an existing artifact: replace content and/or merge tag changes.
   * Throws NOT_FOUND when the target does not exist.
   * Tag merge: existing tags minus removeTags, then unioned with addTags (deduped).
   */
  private async updateEntityArtifact(
    entityType: EntityType,
    entityId: string,
    filename: string,
    options: UpdateArtifactOptions
  ): Promise<ArtifactMetadata> {
    const normalizedFilename = normalizeArtifactFilename(filename);
    const table = this.getStoreTable(entityType, entityId);
    const existing = await this.store.get<ArtifactMetadata>(table, normalizedFilename);
    if (!existing) {
      throw new AppError(
        `Artifact not found: ${normalizedFilename} (${entityType}/${entityId})`,
        APP_ERROR_CODES.NOT_FOUND
      );
    }

    if (
      options.expectedUpdatedTimestamp !== undefined &&
      existing.value.updatedTimestamp !== options.expectedUpdatedTimestamp
    ) {
      throw new AppError(
        `Artifact was modified since it was read. Re-read the artifact and retry the edit.`,
        APP_ERROR_CODES.CONFLICT
      );
    }

    let newSize = existing.value.size;
    if (options.content !== undefined) {
      const buf = Buffer.isBuffer(options.content) ? options.content : Buffer.from(options.content, "utf-8");
      const filePath = this.getEntityArtifactPath(entityType, entityId, existing.value.id);
      await writeBinaryFile(filePath, buf);
      newSize = buf.length;
    }

    const currentTags = normalizeTags(existing.value.tags);
    const removeSet = new Set(normalizeTags(options.removeTags));
    const retained = currentTags.filter((tag) => !removeSet.has(tag));
    const newTags = normalizeTags(retained.concat(options.addTags ?? []));

    const metadata: ArtifactMetadata = {
      ...existing.value,
      size: newSize,
      tags: newTags,
      updatedTimestamp: Date.now(),
    };

    await this.store.set(table, normalizedFilename, metadata);
    log.info(
      {
        entityType,
        entityId,
        filename: normalizedFilename,
        id: metadata.id,
        contentReplaced: options.content !== undefined,
      },
      "Artifact updated"
    );

    this.emit("artifactSaved", { metadata });
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
    const requiredTags = options?.tags?.length ? normalizeTags(options.tags) : undefined;
    const filtered = artifacts.filter((artifact) => {
      if (options?.type && artifact.type !== options.type) {
        return false;
      }

      if (requiredTags && !requiredTags.every((tag) => artifact.tags?.includes(tag))) {
        return false;
      }

      return true;
    });
    return filtered.sort((artifactA, artifactB) => artifactB.updatedTimestamp - artifactA.updatedTimestamp);
  }

  private async findEntityArtifactContent(
    entityType: EntityType,
    entityId: string,
    filename: string,
    query: string,
    startLine?: number
  ): Promise<ArtifactContentFindResult> {
    if (!query) {
      throw new AppError("Search query must not be empty.", APP_ERROR_CODES.VALIDATION);
    }

    const { content, metadata } = await this.readEntityArtifact(entityType, entityId, filename);
    if (metadata.contentType !== ARTIFACT_CONTENT_TYPE.TEXT || typeof content !== "string") {
      throw new AppError(
        `Cannot search non-TEXT artifact (${metadata.filename} is ${metadata.contentType}).`,
        APP_ERROR_CODES.VALIDATION
      );
    }

    const lines = content.split(/\r?\n/);
    const fromIndex = Math.max(1, startLine ?? 1) - 1;
    const normalizedQuery = query.toLowerCase();
    const matches: ArtifactContentMatch[] = [];

    for (let lineIndex = fromIndex; lineIndex < lines.length; lineIndex += 1) {
      const lineContent = lines[lineIndex];
      const normalizedLine = lineContent.toLowerCase();
      let searchFrom = 0;
      while (searchFrom <= normalizedLine.length) {
        const matchIndex = normalizedLine.indexOf(normalizedQuery, searchFrom);
        if (matchIndex === -1) {
          break;
        }

        matches.push({
          lineNumber: lineIndex + 1,
          lineContent,
          matchIndex,
        });
        searchFrom = matchIndex + normalizedQuery.length;
      }
    }

    return {
      found: matches.length > 0,
      matchCount: matches.length,
      matches,
    };
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
      this.emit("artifactDeleted", { metadata: existing.value });
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
