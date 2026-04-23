import { useMemo, useRef } from "react";
import type { AgentTaskItem, AgentConfig } from "@crow-central-agency/shared";
import { getTaskStateOrder } from "../../utils/task-utils.js";
import { useContainerColumns } from "../../hooks/use-container-columns.js";
import { useVirtualList } from "../../hooks/use-virtual-list.js";
import { TaskCard } from "./task-card.js";

interface TaskListProps {
  tasks: AgentTaskItem[];
  agents: AgentConfig[];
}

/** Estimated row height in pixels (card + gap) for initial layout */
const ESTIMATED_ROW_HEIGHT = 180;

/** Gap between cards in pixels — must match the CSS gap value */
const GRID_GAP = 16;

/**
 * Task list — renders sorted TaskCard items in a virtualized responsive grid.
 * Rows are virtualized via @tanstack/react-virtual; column count is derived
 * from the scroll container width using a ResizeObserver.
 */
export function TaskList({ tasks, agents }: TaskListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const columns = useContainerColumns({ containerRef: scrollRef });

  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((taskA, taskB) => {
        const orderDiff = getTaskStateOrder(taskA.state) - getTaskStateOrder(taskB.state);

        if (orderDiff !== 0) {
          return orderDiff;
        }

        return taskB.updatedTimestamp - taskA.updatedTimestamp;
      }),
    [tasks]
  );

  const rowCount = Math.ceil(sortedTasks.length / columns);
  const virtualizer = useVirtualList({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 3,
    gap: GRID_GAP,
  });

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-6">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualRows.map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowTasks = sortedTasks.slice(startIndex, startIndex + columns);

          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className="grid items-stretch"
                style={{
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  gap: GRID_GAP,
                }}
              >
                {rowTasks.map((task) => (
                  <TaskCard key={task.id} task={task} agents={agents} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
