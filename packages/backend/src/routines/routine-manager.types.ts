import type { AgentConfig, AgentStatus, AgentTaskItem, AgentTaskState } from "@crow-central-agency/shared";
import type { MessageSource } from "../services/message-queue-manager.types.js";
import type { AgentReminder } from "../services/crow-scheduler.types.js";
import type { ArtifactRecord } from "../services/runtime/agent-runtime-manager.types.js";
import type { Feed, FeedItem } from "../feed/simply-feed.types.js";

export interface Routine {
  id: string;
  priority: number;
  onAgentCreated?: (agentConfig: AgentConfig) => Promise<void>;
  onAgentUpdated?: (agentConfig: AgentConfig) => Promise<void>;
  onAgentDeleted?: (agentId: string) => Promise<void>;
  onRuntimeManagerStartup?: () => Promise<void>;
  onMessageDone?: (
    agentId: string,
    source: MessageSource,
    lastAssistantMessage?: string,
    artifactsWritten?: ArtifactRecord[],
    isAbortedOrError?: boolean,
    error?: string
  ) => Promise<void>;
  onAgentStatusChanged?: (agentId: string, status: AgentStatus) => Promise<void>;
  onTaskAdded?: (task: AgentTaskItem) => Promise<void>;
  onTaskUpdated?: (task: AgentTaskItem) => Promise<void>;
  onTaskAssigned?: (task: AgentTaskItem) => Promise<void>;
  onTaskStateChanged?: (task: AgentTaskItem, previousState: AgentTaskState) => Promise<void>;
  onLoopTick?: (agentId: string, prompt: string) => Promise<void>;
  onReminderFired?: (reminder: AgentReminder) => Promise<void>;
  onFeedAdded?: (feed: Feed) => Promise<void>;
  onFeedRemoved?: (feedId: string) => Promise<void>;
  onNewFeedItems?: (feed: Feed, items: FeedItem[]) => Promise<void>;
}
