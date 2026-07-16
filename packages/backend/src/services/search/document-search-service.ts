import MiniSearch from "minisearch";
import {
  AGENT_TASK_STATE,
  ARTIFACT_CONTENT_TYPE,
  ENTITY_TYPE,
  type AgentTaskItem,
  type ArtifactMetadata,
  type EntityType,
  type Fragment,
} from "@crow-central-agency/shared";
import { logger } from "../../utils/logger.js";
import type { ArtifactManager } from "../artifact/artifact-manager.js";
import type { AgentTaskManager } from "../agent-task-manager.js";
import type { FragmentManager } from "../fragment/fragment-manager.js";
import type { AgentRegistry } from "../agent-registry.js";
import type { AgentCircleManager } from "../agent-circle-manager.js";
import {
  DATA_SOURCE_TYPE,
  GLOBAL_PROVENANCE_ID,
  type DataSourceType,
  type DocumentRef,
  type DocumentSearchHit,
  type DocumentSearchOptions,
  type SearchDocument,
} from "./document-search-service.types.js";

/** Internal shape stored in MiniSearch: a SearchDocument plus the composite key and joined tag text. */
interface IndexedDocument extends SearchDocument {
  uid: string;
  tagText: string;
}

const SEARCHABLE_FIELDS = ["title", "text", "tagText"];
const STORED_FIELDS = ["documentId", "dataSourceType", "provenanceId", "title", "tags"];

/** Field boosts: a title hit outweighs a tag hit, which outweighs a body hit. */
const FIELD_BOOST = { title: 4, tagText: 2 };

/** Max edit distance as a fraction of term length — tolerates typos and minor variations. */
const FUZZY_DISTANCE = 0.2;

const log = logger.child({ context: "document-search-service" });

/** Identity is the (dataSourceType, provenanceId, documentId) triple, since documentIds (e.g. artifact filenames) repeat across containers. */
function toUid(ref: DocumentRef): string {
  return `${ref.dataSourceType}:${ref.provenanceId}:${ref.documentId}`;
}

function toIndexedDocument(document: SearchDocument): IndexedDocument {
  return {
    ...document,
    uid: toUid(document),
    tagText: document.tags?.join(" ") ?? "",
  };
}

function artifactDataSourceType(entityType: EntityType): DataSourceType {
  return entityType === ENTITY_TYPE.AGENT_CIRCLE ? DATA_SOURCE_TYPE.CIRCLE_ARTIFACT : DATA_SOURCE_TYPE.ARTIFACT;
}

function artifactRef(metadata: ArtifactMetadata): DocumentRef {
  return {
    documentId: metadata.filename,
    dataSourceType: artifactDataSourceType(metadata.entityType),
    provenanceId: metadata.entityId,
  };
}

function taskRef(taskId: string): DocumentRef {
  return { documentId: taskId, dataSourceType: DATA_SOURCE_TYPE.TASK, provenanceId: GLOBAL_PROVENANCE_ID };
}

function fragmentRef(fragmentId: string): DocumentRef {
  return { documentId: fragmentId, dataSourceType: DATA_SOURCE_TYPE.FRAGMENT, provenanceId: GLOBAL_PROVENANCE_ID };
}

/**
 * In-memory full-text search over workspace documents (artifacts, circle artifacts, tasks,
 * fragments), backed by MiniSearch. On `initialize` it indexes everything that already exists,
 * then keeps the index in sync by subscribing to artifact, task, and fragment change events.
 * `search` ranks matches with prefix and fuzzy matching, filtered to what the caller is allowed
 * to see.
 */
export class DocumentSearchService {
  private readonly index: MiniSearch<IndexedDocument>;

  constructor(
    private readonly artifactManager: ArtifactManager,
    private readonly taskManager: AgentTaskManager,
    private readonly registry: AgentRegistry,
    private readonly circleManager: AgentCircleManager,
    private readonly fragmentManager: FragmentManager
  ) {
    this.index = new MiniSearch<IndexedDocument>({
      idField: "uid",
      fields: SEARCHABLE_FIELDS,
      storeFields: STORED_FIELDS,
      searchOptions: {
        boost: FIELD_BOOST,
        fuzzy: FUZZY_DISTANCE,
        prefix: true,
      },
    });
  }

  public async initialize(): Promise<void> {
    await this.indexAllArtifacts();
    this.indexAllTasks();
    await this.indexAllFragments();
    this.subscribe();
  }

  public search(query: string, options?: DocumentSearchOptions): DocumentSearchHit[] {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    const filter = options?.filter;
    const results = this.index.search(trimmedQuery, {
      filter: filter
        ? (result) =>
            filter({
              documentId: result.documentId,
              dataSourceType: result.dataSourceType,
              provenanceId: result.provenanceId,
            })
        : undefined,
    });

    const limited = options?.limit !== undefined ? results.slice(0, options.limit) : results;
    return limited.map((result) => ({
      documentId: result.documentId,
      dataSourceType: result.dataSourceType,
      provenanceId: result.provenanceId,
      title: result.title,
      tags: result.tags?.length ? result.tags : undefined,
      score: result.score,
    }));
  }

  private subscribe(): void {
    this.artifactManager.on("artifactSaved", ({ metadata }) => void this.indexArtifact(metadata));
    this.artifactManager.on("artifactDeleted", ({ metadata }) => this.removeDocument(artifactRef(metadata)));

    this.taskManager.on("taskAdded", ({ task }) => this.indexTask(task));
    this.taskManager.on("taskUpdated", ({ task }) => this.indexTask(task));
    this.taskManager.on("taskStateChanged", ({ task }) => {
      if (task.state === AGENT_TASK_STATE.COMPLETED || task.state === AGENT_TASK_STATE.INCOMPLETE) {
        this.indexTask(task);
      }
    });
    this.taskManager.on("taskDeleted", ({ taskId }) => this.removeDocument(taskRef(taskId)));

    this.fragmentManager.on("fragmentCreated", ({ fragment }) => this.indexFragment(fragment));
    this.fragmentManager.on("fragmentUpdated", ({ fragment }) => this.indexFragment(fragment));
    this.fragmentManager.on("fragmentDeleted", ({ fragmentId }) => this.removeDocument(fragmentRef(fragmentId)));
  }

  private async indexAllArtifacts(): Promise<void> {
    for (const agent of this.registry.getAllAgents(true)) {
      const artifacts = await this.artifactManager.listArtifacts(agent.id);
      for (const metadata of artifacts) {
        await this.indexArtifact(metadata);
      }
    }

    for (const circle of this.circleManager.getAllCircles()) {
      const artifacts = await this.artifactManager.listCircleArtifacts(circle.id);
      for (const metadata of artifacts) {
        await this.indexArtifact(metadata);
      }
    }
  }

  private indexAllTasks(): void {
    for (const task of this.taskManager.getAllTasks()) {
      this.indexTask(task);
    }
  }

  private async indexArtifact(metadata: ArtifactMetadata): Promise<void> {
    if (metadata.contentType !== ARTIFACT_CONTENT_TYPE.TEXT) {
      this.removeDocument(artifactRef(metadata));
      return;
    }

    try {
      const { content } =
        metadata.entityType === ENTITY_TYPE.AGENT_CIRCLE
          ? await this.artifactManager.readCircleArtifact(metadata.entityId, metadata.filename)
          : await this.artifactManager.readArtifact(metadata.entityId, metadata.filename);
      this.indexDocument({
        ...artifactRef(metadata),
        title: metadata.filename,
        text: typeof content === "string" ? content : "",
        tags: metadata.tags?.length ? metadata.tags : undefined,
      });
    } catch (error) {
      log.error({ error, filename: metadata.filename, entityId: metadata.entityId }, "Failed to index artifact");
    }
  }

  private async indexAllFragments(): Promise<void> {
    for (const fragment of await this.fragmentManager.getAllFragments()) {
      this.indexFragment(fragment);
    }
  }

  private indexTask(task: AgentTaskItem): void {
    this.indexDocument({
      ...taskRef(task.id),
      title: task.task,
      text: task.taskResult ?? "",
    });
  }

  private indexFragment(fragment: Fragment): void {
    this.indexDocument({
      ...fragmentRef(fragment.id),
      title: fragment.cue,
      text: fragment.body,
      tags: [fragment.kind],
    });
  }

  /** Add a new document, or replace the existing one with the same identity. */
  private indexDocument(document: SearchDocument): void {
    const indexed = toIndexedDocument(document);
    if (this.index.has(indexed.uid)) {
      this.index.replace(indexed);
    } else {
      this.index.add(indexed);
    }
  }

  private removeDocument(ref: DocumentRef): void {
    const uid = toUid(ref);
    if (this.index.has(uid)) {
      this.index.discard(uid);
    }
  }
}
