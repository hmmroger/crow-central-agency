import type { AgentConfig } from "@crow-central-agency/shared";

interface DashboardStatsBarProps {
  agents: AgentConfig[];
  activeCount: number;
  totalCost: number;
}

/**
 * Global stats bar — total agents, active count, total cost.
 */
export function DashboardStatsBar({ agents, activeCount, totalCost }: DashboardStatsBarProps) {
  return (
    <div className="flex items-center gap-4 text-xs text-text-muted">
      <span>
        {agents.length} agent{agents.length !== 1 ? "s" : ""}
      </span>
      {activeCount > 0 && <span className="text-primary">{activeCount} active</span>}
      {totalCost > 0 && <span>${totalCost.toFixed(4)} total</span>}
    </div>
  );
}
