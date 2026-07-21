import { describe, expect, it } from "vitest";
import { AGENT_TASK_SOURCE_TYPE, type AgentTaskItem } from "@crow-central-agency/shared";
import { AgentTaskManager } from "./agent-task-manager.js";
import { AgentCircleManager } from "./agent-circle-manager.js";
import { RelationshipManager } from "./relationship-manager.js";
import { WsBroadcaster } from "./ws-broadcaster.js";
import { InMemoryObjectStore } from "../core/store/in-memory-object-store.mock.js";

interface Harness {
  taskManager: AgentTaskManager;
}

async function createHarness(): Promise<Harness> {
  const broadcaster = new WsBroadcaster();
  const relationshipManager = new RelationshipManager(new InMemoryObjectStore());
  const circleManager = new AgentCircleManager(new InMemoryObjectStore(), relationshipManager, broadcaster);
  const taskManager = new AgentTaskManager(new InMemoryObjectStore(), broadcaster, circleManager);
  await relationshipManager.initialize();
  await circleManager.initialize();
  await taskManager.initialize();

  return { taskManager };
}

async function createOpenUserTask(taskManager: AgentTaskManager): Promise<AgentTaskItem> {
  return taskManager.addTask("Draft me a response", { sourceType: AGENT_TASK_SOURCE_TYPE.USER });
}

/** Event listeners fire via setImmediate; flush one tick so deferred handlers run before assertions. */
async function flushDeferredListeners(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("AgentTaskManager.updateTaskResult", () => {
  it("emits taskResultDrafted and does not emit taskUpdated (no agent notification)", async () => {
    const { taskManager } = await createHarness();
    const task = await createOpenUserTask(taskManager);

    let draftedTask: AgentTaskItem | undefined;
    let taskUpdatedEmitted = false;
    taskManager.on("taskResultDrafted", ({ task: updated }) => {
      draftedTask = updated;
    });
    taskManager.on("taskUpdated", () => {
      taskUpdatedEmitted = true;
    });

    const result = await taskManager.updateTaskResult(task.id, "work in progress");
    await flushDeferredListeners();

    expect(result.taskResult).toBe("work in progress");
    expect(draftedTask?.id).toBe(task.id);
    expect(taskUpdatedEmitted).toBe(false);
  });
});
