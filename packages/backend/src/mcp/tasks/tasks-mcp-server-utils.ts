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

/**
 * Format a task item into a human-readable text block.
 */
export function formatTaskItem(task: AgentTaskItem, timezone?: string): string {
  const lines = [
    `Task ID: ${task.id}`,
    `State: ${task.state}`,
    `Content: ${task.task}`,
    `Created: ${formatLocalDateTime(new Date(task.createdTimestamp), timezone)}`,
    `Updated: ${formatLocalDateTime(new Date(task.updatedTimestamp), timezone)}`,
  ];

  if (task.ownerSource) {
    if (task.ownerSource.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT) {
      lines.push(`Owner: agent ${task.ownerSource.agentId}`);
    } else {
      lines.push(`Owner: ${task.ownerSource.sourceType.toLowerCase()}`);
    }
  }

  if (task.dispatchSource?.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT) {
    lines.push(`Dispatched By Agent: ${task.dispatchSource.agentId}`);
  }

  if (task.originateSource.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT) {
    lines.push(`Originated By Agent: ${task.originateSource.agentId}`);
  } else {
    lines.push(`Originated By: ${task.originateSource.sourceType}`);
  }

  return lines.join("\n");
}
