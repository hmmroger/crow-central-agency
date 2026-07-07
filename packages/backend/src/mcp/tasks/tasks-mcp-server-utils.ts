import type { AgentCircleManager } from "../../services/agent-circle-manager.js";
import { AGENT_TASK_SOURCE_TYPE, type AgentTaskItem, type AgentTaskSource } from "@crow-central-agency/shared";
import { formatLocalDateTime } from "../../utils/date-utils.js";

export function hasVisibilityToTask(
  callerAgentId: string,
  task: AgentTaskItem,
  circleManager: AgentCircleManager
): boolean {
  const sources: AgentTaskSource[] = [task.originateSource];
  if (task.dispatchSource) {
    sources.push(task.dispatchSource);
  }

  if (task.ownerSource) {
    sources.push(task.ownerSource);
  }

  for (const source of sources) {
    if (
      source.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT &&
      !circleManager.isAgentVisible(callerAgentId, source.agentId)
    ) {
      return false;
    }
  }

  return true;
}

const METADATA_SECTION_HEADER = "--- METADATA ---";
const CONTENT_SECTION_HEADER = "--- CONTENT ---";
const TASK_RESULT_SECTION_HEADER = "--- TASK RESULT ---";

function formatTaskMetadata(task: AgentTaskItem, timezone?: string): string[] {
  const provenance: string[] = [];

  if (task.ownerSource) {
    provenance.push(
      task.ownerSource.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT
        ? `Owner: agent ${task.ownerSource.agentId}`
        : `Owner: ${task.ownerSource.sourceType.toLowerCase()}`
    );
  }

  provenance.push(
    task.originateSource.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT
      ? `Originated By: agent ${task.originateSource.agentId}`
      : `Originated By: ${task.originateSource.sourceType}`
  );

  return [
    `Task ID: ${task.id} | State: ${task.state}`,
    provenance.join(" | "),
    `Created: ${formatLocalDateTime(new Date(task.createdTimestamp), timezone)}`,
  ];
}

export function formatTaskItem(task: AgentTaskItem, timezone?: string): string[] {
  return [METADATA_SECTION_HEADER, ...formatTaskMetadata(task, timezone), "", CONTENT_SECTION_HEADER, task.task];
}

export function formatTaskResult(task: AgentTaskItem, timezone?: string): string[] {
  const lines = [METADATA_SECTION_HEADER, ...formatTaskMetadata(task, timezone), "", TASK_RESULT_SECTION_HEADER];
  if (task.taskResult) {
    lines.push(task.taskResult);
  }

  return lines;
}
