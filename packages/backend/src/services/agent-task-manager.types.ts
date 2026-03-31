import type { AgentTaskItem, AgentTaskState } from "@crow-central-agency/shared";
import type { EventMap } from "../event-bus/event-bus.types.js";

export interface AgentTaskManagerEvents extends EventMap {
  taskAdded: { task: AgentTaskItem };
  taskUpdated: { task: AgentTaskItem };
  taskStateChanged: { task: AgentTaskItem; previousState: AgentTaskState };
  taskDeleted: { taskId: string };
  taskAssigned: { task: AgentTaskItem };
}
