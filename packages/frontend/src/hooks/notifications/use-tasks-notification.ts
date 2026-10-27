import { useMemo } from "react";
import { AGENT_TASK_STATE } from "@crow-central-agency/shared";
import { useTasksContext } from "../../providers/tasks-provider.js";
import { NAV_NOTIFICATION_KIND, type NavNotification } from "../../providers/notifications-provider.types.js";

/** Tasks nav notification: count of OPEN tasks */
export function useTasksNotification(): NavNotification | undefined {
  const { tasks } = useTasksContext();
  const count = useMemo(() => tasks.filter((task) => task.state === AGENT_TASK_STATE.OPEN).length, [tasks]);

  return useMemo(
    () => ({
      kind: NAV_NOTIFICATION_KIND.COUNT,
      count,
      description: `${count} open ${count === 1 ? "task" : "tasks"}`,
    }),
    [count]
  );
}
