import { AGENT_TASK_STATE, type AgentTaskItem } from "@crow-central-agency/shared";
import type { AgentTaskManager } from "../../agent-task-manager.js";
import {
  DATA_SOURCE_TYPE,
  GLOBAL_PROVENANCE_ID,
  type DocumentRef,
  type SearchDocument,
  type SearchSource,
  type SearchSourceListener,
} from "../document-search-service.types.js";

/** Indexes agent tasks: the task text as title and its result as body. */
export class TaskSearchSource implements SearchSource {
  public readonly dataSourceTypes = [DATA_SOURCE_TYPE.TASK];

  constructor(private readonly taskManager: AgentTaskManager) {}

  public async *loadAll(): AsyncIterable<SearchDocument> {
    for (const task of this.taskManager.getAllTasks()) {
      yield this.toDocument(task);
    }
  }

  public subscribe(listener: SearchSourceListener): void {
    this.taskManager.on("taskAdded", ({ task }) => listener.onDocumentUpdate(this.toDocument(task)));
    this.taskManager.on("taskUpdated", ({ task }) => listener.onDocumentUpdate(this.toDocument(task)));
    this.taskManager.on("taskStateChanged", ({ task }) => {
      if (task.state === AGENT_TASK_STATE.COMPLETED || task.state === AGENT_TASK_STATE.INCOMPLETE) {
        listener.onDocumentUpdate(this.toDocument(task));
      }
    });
    this.taskManager.on("taskDeleted", ({ taskId }) => listener.onDocumentRemove(this.toRef(taskId)));
  }

  private toDocument(task: AgentTaskItem): SearchDocument {
    return {
      ...this.toRef(task.id),
      title: task.task,
      text: task.taskResult ?? "",
    };
  }

  private toRef(taskId: string): DocumentRef {
    return { documentId: taskId, dataSourceType: DATA_SOURCE_TYPE.TASK, provenanceId: GLOBAL_PROVENANCE_ID };
  }
}
