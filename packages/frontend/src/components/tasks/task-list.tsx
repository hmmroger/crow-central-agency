import { useMemo } from "react";
import type { AgentTaskItem, AgentConfig } from "@crow-central-agency/shared";
import { getTaskStateOrder } from "../../utils/task-utils.js";
import { TaskCard } from "./task-card.js";

interface TaskListProps {
  tasks: AgentTaskItem[];
  agents: AgentConfig[];
}

/**
 * Task list — renders sorted TaskCard items with staggered entry animation.
 * Sorted by state priority: ACTIVE > OPEN > INCOMPLETE > COMPLETED > CLOSED,
 * then by most recently updated within each group.
 */
export function TaskList({ tasks, agents }: TaskListProps) {
  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((taskA, taskB) => {
        const orderDiff = getTaskStateOrder(taskA.state) - getTaskStateOrder(taskB.state);

        if (orderDiff !== 0) {
          return orderDiff;
        }

        // Within same state group, most recent first
        return taskB.updatedTimestamp - taskA.updatedTimestamp;
      }),
    [tasks]
  );

  return (
    <div className="flex flex-col gap-2">
      {sortedTasks.map((task, index) => (
        <div
          key={task.id}
          className="animate-[fade-slide-up_var(--duration-normal)_var(--ease-out)_both]"
          style={{ animationDelay: `${index * 30}ms` }}
        >
          <TaskCard task={task} agents={agents} />
        </div>
      ))}
    </div>
  );
}
