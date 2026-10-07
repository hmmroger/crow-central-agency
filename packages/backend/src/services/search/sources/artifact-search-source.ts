import {
  ARTIFACT_CONTENT_TYPE,
  ENTITY_TYPE,
  type ArtifactMetadata,
  type EntityType,
} from "@crow-central-agency/shared";
import { logger } from "../../../utils/logger.js";
import type { ArtifactManager } from "../../artifact/artifact-manager.js";
import type { AgentRegistry } from "../../agent-registry.js";
import type { AgentCircleManager } from "../../agent-circle-manager.js";
import {
  DATA_SOURCE_TYPE,
  type DocumentRef,
  type SearchDocument,
  type SearchIndexSink,
  type SearchSource,
} from "../document-search-service.types.js";

const log = logger.child({ context: "artifact-search-source" });

/** Indexes text artifacts owned by agents and circles. */
export class ArtifactSearchSource implements SearchSource {
  public readonly dataSourceTypes = [DATA_SOURCE_TYPE.ARTIFACT, DATA_SOURCE_TYPE.CIRCLE_ARTIFACT];

  constructor(
    private readonly artifactManager: ArtifactManager,
    private readonly registry: AgentRegistry,
    private readonly circleManager: AgentCircleManager
  ) {}

  public async *loadAll(): AsyncIterable<SearchDocument> {
    for (const agent of this.registry.getAllAgents(true)) {
      yield* this.loadArtifacts(await this.listContainerArtifacts(ENTITY_TYPE.AGENT, agent.id));
    }

    for (const circle of this.circleManager.getAllCircles()) {
      yield* this.loadArtifacts(await this.listContainerArtifacts(ENTITY_TYPE.AGENT_CIRCLE, circle.id));
    }
  }

  public subscribe(sink: SearchIndexSink): void {
    this.artifactManager.on("artifactSaved", ({ metadata }) => void this.indexArtifact(sink, metadata));
    this.artifactManager.on("artifactDeleted", ({ metadata }) => sink.remove(this.toRef(metadata)));
  }

  private async listContainerArtifacts(entityType: EntityType, entityId: string): Promise<ArtifactMetadata[]> {
    try {
      return entityType === ENTITY_TYPE.AGENT_CIRCLE
        ? await this.artifactManager.listCircleArtifacts(entityId)
        : await this.artifactManager.listArtifacts(entityId);
    } catch (error) {
      log.error({ error, entityType, entityId }, "Failed to list artifacts for indexing");
      return [];
    }
  }

  private async *loadArtifacts(artifacts: ArtifactMetadata[]): AsyncIterable<SearchDocument> {
    for (const metadata of artifacts) {
      if (metadata.contentType !== ARTIFACT_CONTENT_TYPE.TEXT) {
        continue;
      }

      try {
        yield await this.toDocument(metadata);
      } catch (error) {
        this.logIndexError(error, metadata);
      }
    }
  }

  private async indexArtifact(sink: SearchIndexSink, metadata: ArtifactMetadata): Promise<void> {
    if (metadata.contentType !== ARTIFACT_CONTENT_TYPE.TEXT) {
      sink.remove(this.toRef(metadata));
      return;
    }

    try {
      sink.upsert(await this.toDocument(metadata));
    } catch (error) {
      this.logIndexError(error, metadata);
    }
  }

  private async toDocument(metadata: ArtifactMetadata): Promise<SearchDocument> {
    const { content } =
      metadata.entityType === ENTITY_TYPE.AGENT_CIRCLE
        ? await this.artifactManager.readCircleArtifact(metadata.entityId, metadata.filename)
        : await this.artifactManager.readArtifact(metadata.entityId, metadata.filename);

    return {
      ...this.toRef(metadata),
      title: metadata.filename,
      text: typeof content === "string" ? content : "",
      tags: metadata.tags?.length ? metadata.tags : undefined,
    };
  }

  private toRef(metadata: ArtifactMetadata): DocumentRef {
    return {
      documentId: metadata.filename,
      dataSourceType:
        metadata.entityType === ENTITY_TYPE.AGENT_CIRCLE ? DATA_SOURCE_TYPE.CIRCLE_ARTIFACT : DATA_SOURCE_TYPE.ARTIFACT,
      provenanceId: metadata.entityId,
    };
  }

  private logIndexError(error: unknown, metadata: ArtifactMetadata): void {
    log.error({ error, filename: metadata.filename, entityId: metadata.entityId }, "Failed to index artifact");
  }
}
