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
  type SearchSource,
  type SearchSourceListener,
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

  public subscribe(listener: SearchSourceListener): void {
    this.artifactManager.on("artifactSaved", ({ metadata }) => void this.reportSavedArtifact(listener, metadata));
    this.artifactManager.on("artifactDeleted", ({ metadata }) => listener.onDocumentRemove(this.toRef(metadata)));
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

      const document = await this.readDocument(metadata);
      if (document) {
        yield document;
      }
    }
  }

  private async reportSavedArtifact(listener: SearchSourceListener, metadata: ArtifactMetadata): Promise<void> {
    if (metadata.contentType !== ARTIFACT_CONTENT_TYPE.TEXT) {
      listener.onDocumentRemove(this.toRef(metadata));
      return;
    }

    const document = await this.readDocument(metadata);
    if (document) {
      listener.onDocumentUpdate(document);
    }
  }

  /** Reads the artifact's content and builds its document; a failed read is logged and returns undefined. */
  private async readDocument(metadata: ArtifactMetadata): Promise<SearchDocument | undefined> {
    try {
      const { content } =
        metadata.entityType === ENTITY_TYPE.AGENT_CIRCLE
          ? await this.artifactManager.readCircleArtifact(metadata.entityId, metadata.filename)
          : await this.artifactManager.readArtifact(metadata.entityId, metadata.filename);

      return this.toDocument(metadata, content);
    } catch (error) {
      log.error({ error, filename: metadata.filename, entityId: metadata.entityId }, "Failed to index artifact");
      return undefined;
    }
  }

  private toDocument(metadata: ArtifactMetadata, content: string | Buffer): SearchDocument {
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
}
