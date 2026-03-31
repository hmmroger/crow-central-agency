import { useMemo, type ComponentType } from "react";
import { AGENT_TASK_STATE, type AgentTaskItem } from "@crow-central-agency/shared";
import { Zap, CircleDot, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { cn } from "../../utils/cn.js";

interface TaskStatsBarProps {
  tasks: AgentTaskItem[];
}

interface StatChipProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  colorClass: string;
}

/** Compute task counts by state */
function computeStats(tasks: AgentTaskItem[]) {
  let active = 0;
  let open = 0;
  let completed = 0;
  let incomplete = 0;
  let closed = 0;

  for (const task of tasks) {
    switch (task.state) {
      case AGENT_TASK_STATE.ACTIVE:
        active++;
        break;
      case AGENT_TASK_STATE.OPEN:
        open++;
        break;
      case AGENT_TASK_STATE.COMPLETED:
        completed++;
        break;
      case AGENT_TASK_STATE.INCOMPLETE:
        incomplete++;
        break;
      case AGENT_TASK_STATE.CLOSED:
        closed++;
        break;
    }
  }

  return { active, open, completed, incomplete, closed, total: tasks.length };
}

/**
 * Compact task stats bar for the dashboard.
 * Shows key task metrics with color-coded icons, live-updating from TasksProvider.
 */
export function TaskStatsBar({ tasks }: TaskStatsBarProps) {
  const stats = useMemo(() => computeStats(tasks), [tasks]);

  if (stats.total === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-4 px-6 py-3 border-b border-border-subtle/40">
      <span className="text-xs text-text-muted font-medium uppercase tracking-wide mr-1">Tasks</span>

      <StatChip icon={Zap} label="Active" value={stats.active} colorClass="text-accent" />
      <StatChip icon={CircleDot} label="Open" value={stats.open} colorClass="text-primary" />
      <StatChip icon={CheckCircle2} label="Done" value={stats.completed} colorClass="text-success" />
      <StatChip icon={AlertTriangle} label="Incomplete" value={stats.incomplete} colorClass="text-warning" />
      <StatChip icon={XCircle} label="Closed" value={stats.closed} colorClass="text-text-muted" />
    </div>
  );
}

/** Single stat chip: icon + count + label */
function StatChip({ icon: Icon, label, value, colorClass }: StatChipProps) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <Icon className={cn("w-3.5 h-3.5", colorClass)} />
      <span className="font-mono tabular-nums text-text-primary">{value}</span>
      <span className="text-text-muted">{label}</span>
    </span>
  );
}
