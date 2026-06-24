import { Loader2 } from "lucide-react";
import type { FleetAgentView } from "@crow-central-agency/shared";
import { FleetAgentCard } from "./fleet-agent-card.js";

interface FleetBoardProps {
  agents: FleetAgentView[];
  /** A design/refine run is in flight — overlay the board with a busy state. */
  isBusy: boolean;
  /** Label shown alongside the busy spinner. */
  busyLabel: string;
  /** Per-agent build errors keyed by agent name; flags the cards that failed to build. */
  errorsByName?: Map<string, string>;
  /** Names of agents already created in the current/last build; flags the cards as built. */
  builtNames?: Set<string>;
}

/**
 * Scrolling board of read-only agent cards. The empty state is an empty board (no center hint, by
 * design). A busy overlay covers the board during design/refine (the whole fleet is being
 * regenerated); a build instead surfaces per-card progress via `builtNames`. Agents whose build failed
 * are flagged via `errorsByName` (keyed by name — FleetAgent has no id).
 */
export function FleetBoard({ agents, isBusy, busyLabel, errorsByName, builtNames }: FleetBoardProps) {
  return (
    <div className="relative flex-1 overflow-y-auto px-6 py-4">
      {agents.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent, index) => (
            <FleetAgentCard
              key={`${agent.name}-${index}`}
              agent={agent}
              error={errorsByName?.get(agent.name)}
              built={builtNames?.has(agent.name)}
            />
          ))}
        </div>
      )}

      {isBusy && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-base/60 backdrop-blur-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-xs text-text-muted">{busyLabel}</span>
        </div>
      )}
    </div>
  );
}
