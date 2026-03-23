import type { AgentConfig } from "@crow-central-agency/shared";

interface DashboardStatsBarProps {
  agents: AgentConfig[];
}

/**
 * Global stats bar — agent count. Active count and total cost will be
 * added when a per-agent status aggregation mechanism is implemented.
 */
export function DashboardStatsBar({ agents }: DashboardStatsBarProps) {
  return (
    <div className="flex items-center gap-4 text-xs text-text-muted">
      <span>
        {agents.length} agent{agents.length !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
