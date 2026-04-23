import { useMemo, type ComponentType } from "react";
import { AGENT_TASK_STATE, type AgentTaskItem, type AgentTaskState } from "@crow-central-agency/shared";
import { Zap, CircleDot, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { MetricCard } from "../common/metric-card.js";
import { DashboardWidget } from "./dashboard-widget.js";
import { useAppStore } from "../../stores/app-store.js";
import { cn } from "../../utils/cn.js";

interface TaskStatsPanelProps {
  tasks: AgentTaskItem[];
  className?: string;
  /** When true, render inline without the widget wrapper for use in a compact strip */
  compact?: boolean;
}

interface MetricDefinition {
  state: AgentTaskState;
  label: string;
  icon: ComponentType<{ className?: string }>;
  accentClass: string;
  accentBgClass: string;
}

/** Compute task counts keyed by state */
function computeStats(tasks: AgentTaskItem[]): Record<AgentTaskState, number> {
  const counts: Record<AgentTaskState, number> = {
    [AGENT_TASK_STATE.ACTIVE]: 0,
    [AGENT_TASK_STATE.OPEN]: 0,
    [AGENT_TASK_STATE.COMPLETED]: 0,
    [AGENT_TASK_STATE.INCOMPLETE]: 0,
    [AGENT_TASK_STATE.CLOSED]: 0,
  };

  for (const task of tasks) {
    if (task.state in counts) {
      counts[task.state]++;
    }
  }

  return counts;
}

const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    state: AGENT_TASK_STATE.ACTIVE,
    label: "Active",
    icon: Zap,
    accentClass: "text-primary",
    accentBgClass: "bg-primary/10",
  },
  {
    state: AGENT_TASK_STATE.OPEN,
    label: "Open",
    icon: CircleDot,
    accentClass: "text-secondary",
    accentBgClass: "bg-secondary/10",
  },
  {
    state: AGENT_TASK_STATE.COMPLETED,
    label: "Completed",
    icon: CheckCircle2,
    accentClass: "text-success",
    accentBgClass: "bg-success/10",
  },
  {
    state: AGENT_TASK_STATE.INCOMPLETE,
    label: "Incomplete",
    icon: AlertTriangle,
    accentClass: "text-warning",
    accentBgClass: "bg-warning/10",
  },
  {
    state: AGENT_TASK_STATE.CLOSED,
    label: "Closed",
    icon: XCircle,
    accentClass: "text-text-muted",
    accentBgClass: "bg-surface-elevated",
  },
];

/**
 * Task stats panel for the dashboard.
 * Displays metric cards for each task state.
 */
export function TaskStatsPanel({ tasks, className, compact = false }: TaskStatsPanelProps) {
  const stats = useMemo(() => computeStats(tasks), [tasks]);
  const goToTasksView = useAppStore((state) => state.goToTasksView);
  const cards = useMemo(
    () =>
      METRIC_DEFINITIONS.map((definition, index) => (
        <MetricCard
          key={definition.state}
          icon={definition.icon}
          label={definition.label}
          value={stats[definition.state]}
          accentClass={definition.accentClass}
          accentBgClass={definition.accentBgClass}
          index={index}
          onClick={() => goToTasksView(definition.state)}
        />
      )),
    [stats, goToTasksView]
  );

  if (compact) {
    return <div className={cn("flex items-center gap-2", className)}>{cards}</div>;
  }

  return (
    <DashboardWidget title="Task Stats" className={className}>
      <div className="flex flex-wrap gap-2">{cards}</div>
    </DashboardWidget>
  );
}
