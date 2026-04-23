import type { AgentTaskItem, AgentTaskState, AgentStatus, AgentConfig } from "@crow-central-agency/shared";
import { logger } from "../utils/logger.js";
import type { AgentTaskManager } from "../services/agent-task-manager.js";
import type { AgentRuntimeManager } from "../services/runtime/agent-runtime-manager.js";
import type { CrowScheduler } from "../services/crow-scheduler.js";
import type { AgentReminder } from "../services/crow-scheduler.types.js";
import type { MessageSource } from "../services/message-queue-manager.types.js";
import type { Routine } from "./routine-manager.types.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { ArtifactRecord } from "../services/runtime/agent-runtime-manager.types.js";
import type { SimplyFeedManager } from "../feed/simply-feed-manager.js";
import type { Feed, FeedItem } from "../feed/simply-feed.types.js";

const log = logger.child({ context: "routine-manager" });

export class RoutineManager {
  private routines: Routine[] = [];

  constructor(
    registry: AgentRegistry,
    runtimeManager: AgentRuntimeManager,
    taskManager: AgentTaskManager,
    scheduler: CrowScheduler,
    feedManager: SimplyFeedManager
  ) {
    registry.on("agentCreated", ({ agent }) => this.onAgentCreated(agent));
    registry.on("agentUpdated", ({ agent }) => this.onAgentUpdated(agent));
    registry.on("agentDeleted", ({ agentId }) => this.onAgentDeleted(agentId));
    runtimeManager.on("runtimeManagerStartup", () => this.onRuntimeManagerStartup());
    runtimeManager.on(
      "messageDone",
      ({ agentId, source, lastAssistantMessage, artifactsWritten, isAbortedOrError, error }) =>
        this.onMessageDone(agentId, source, lastAssistantMessage, artifactsWritten, isAbortedOrError, error)
    );
    runtimeManager.on("agentStatusChanged", ({ agentId, status }) => this.onAgentStatusChanged(agentId, status));
    taskManager.on("taskAdded", ({ task }) => this.onTaskAdded(task));
    taskManager.on("taskUpdated", ({ task }) => this.onTaskUpdated(task));
    taskManager.on("taskAssigned", ({ task }) => this.onTaskAssigned(task));
    taskManager.on("taskStateChanged", ({ task, previousState }) => this.onTaskStateChanged(task, previousState));
    scheduler.on("loopTick", ({ agentId, prompt }) => this.onLoopTick(agentId, prompt));
    scheduler.on("reminderFired", ({ reminder }) => this.onReminderFired(reminder));
    feedManager.on("feedAdded", ({ feed }) => this.onFeedAdded(feed));
    feedManager.on("feedRemoved", ({ feedId }) => this.onFeedRemoved(feedId));
    feedManager.on("newFeedItems", ({ feed, items }) => this.onNewFeedItems(feed, items));
  }

  public addRoutine(routine: Routine): void {
    this.routines.push(routine);
    this.routines.sort((a, b) => a.priority - b.priority);
    log.info({ routineId: routine.id, totalRoutines: this.routines.length }, "Routine added.");
  }

  private async onAgentCreated(agentConfig: AgentConfig) {
    for (const routine of this.routines) {
      await this.safeCall(routine, () => routine.onAgentCreated?.(agentConfig));
    }
  }

  private async onAgentUpdated(agentConfig: AgentConfig) {
    for (const routine of this.routines) {
      await this.safeCall(routine, () => routine.onAgentUpdated?.(agentConfig));
    }
  }

  private async onAgentDeleted(agentId: string) {
    for (const routine of this.routines) {
      await this.safeCall(routine, () => routine.onAgentDeleted?.(agentId));
    }
  }

  private async onRuntimeManagerStartup(): Promise<void> {
    for (const routine of this.routines) {
      await this.safeCall(routine, () => routine.onRuntimeManagerStartup?.());
    }
  }

  private async onMessageDone(
    agentId: string,
    source: MessageSource,
    lastAssistantMessage?: string,
    artifactsWritten?: ArtifactRecord[],
    isAbortedOrError?: boolean,
    error?: string
  ): Promise<void> {
    for (const routine of this.routines) {
      await this.safeCall(routine, () =>
        routine.onMessageDone?.(agentId, source, lastAssistantMessage, artifactsWritten, isAbortedOrError, error)
      );
    }
  }

  private async onAgentStatusChanged(agentId: string, status: AgentStatus): Promise<void> {
    for (const routine of this.routines) {
      await this.safeCall(routine, () => routine.onAgentStatusChanged?.(agentId, status));
    }
  }

  private async onTaskAdded(task: AgentTaskItem): Promise<void> {
    for (const routine of this.routines) {
      await this.safeCall(routine, () => routine.onTaskAdded?.(task));
    }
  }

  private async onTaskUpdated(task: AgentTaskItem): Promise<void> {
    for (const routine of this.routines) {
      await this.safeCall(routine, () => routine.onTaskUpdated?.(task));
    }
  }

  private async onTaskAssigned(task: AgentTaskItem): Promise<void> {
    for (const routine of this.routines) {
      await this.safeCall(routine, () => routine.onTaskAssigned?.(task));
    }
  }

  private async onTaskStateChanged(task: AgentTaskItem, previousState: AgentTaskState): Promise<void> {
    for (const routine of this.routines) {
      await this.safeCall(routine, () => routine.onTaskStateChanged?.(task, previousState));
    }
  }

  private async onLoopTick(agentId: string, prompt: string): Promise<void> {
    for (const routine of this.routines) {
      await this.safeCall(routine, () => routine.onLoopTick?.(agentId, prompt));
    }
  }

  private async onReminderFired(reminder: AgentReminder): Promise<void> {
    for (const routine of this.routines) {
      await this.safeCall(routine, () => routine.onReminderFired?.(reminder));
    }
  }

  private async onFeedAdded(feed: Feed): Promise<void> {
    for (const routine of this.routines) {
      await this.safeCall(routine, () => routine.onFeedAdded?.(feed));
    }
  }

  private async onFeedRemoved(feedId: string): Promise<void> {
    for (const routine of this.routines) {
      await this.safeCall(routine, () => routine.onFeedRemoved?.(feedId));
    }
  }

  private async onNewFeedItems(feed: Feed, items: FeedItem[]): Promise<void> {
    for (const routine of this.routines) {
      await this.safeCall(routine, () => routine.onNewFeedItems?.(feed, items));
    }
  }

  /** Run a routine handler with error isolation — a failing routine does not block others */
  private async safeCall(routine: Routine, handler: () => Promise<void> | void): Promise<void> {
    try {
      await handler();
    } catch (error) {
      log.error({ routineId: routine.id, error }, "Routine handler failed");
    }
  }
}
