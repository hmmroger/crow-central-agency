import { Check } from "lucide-react";
import type { FleetAgentView } from "@crow-central-agency/shared";
import { TagChip } from "../agents/artifact/tag-chip.js";

interface FleetAgentCardProps {
  agent: FleetAgentView;
  /** When set, the agent failed to build — shown as an inline error banner. */
  error?: string;
  /** When true, the agent has already been created in the current/last build. */
  built?: boolean;
}

/**
 * Read-only card for a single World Builder-designed agent: name, description, the persona brief, the
 * AGENT.md brief when present, and chips for any assigned MCP servers / circles (shown by friendly
 * name). Not editable — the board reflects the backend draft. `built` flags an agent already created;
 * `error` flags one that failed to build (inline banner).
 */
export function FleetAgentCard({ agent, error, built }: FleetAgentCardProps) {
  const { mcpServers, circles } = agent;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-subtle/60 bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-text-base">{agent.name}</h3>
          <p className="text-xs text-text-muted line-clamp-3">{agent.description}</p>
        </div>
        {built && (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-3xs font-medium text-success">
            <Check className="h-3 w-3" />
            Built
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-error/20 bg-error/10 px-2 py-1.5 text-2xs text-error">{error}</div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-3xs uppercase tracking-wide text-accent/60">Persona brief</span>
        <p className="text-2xs text-text-neutral leading-relaxed line-clamp-4 whitespace-pre-wrap">
          {agent.personaBrief}
        </p>
      </div>

      {agent.agentMdBrief && (
        <div className="flex flex-col gap-1">
          <span className="text-3xs uppercase tracking-wide text-accent/60">AGENT.md brief</span>
          <p className="text-2xs text-text-neutral leading-relaxed line-clamp-4 whitespace-pre-wrap">
            {agent.agentMdBrief}
          </p>
        </div>
      )}

      {mcpServers.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-3xs uppercase tracking-wide text-text-muted/60">MCP servers</span>
          <div className="flex flex-wrap gap-1">
            {mcpServers.map((mcpServer) => (
              <TagChip key={mcpServer.id} label={mcpServer.name} />
            ))}
          </div>
        </div>
      )}

      {circles.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-3xs uppercase tracking-wide text-text-muted/60">Circles</span>
          <div className="flex flex-wrap gap-1">
            {circles.map((circle) => (
              <TagChip key={circle.id} label={circle.name} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
