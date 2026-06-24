import { CheckCircle2 } from "lucide-react";
import type { AgentBuilderBuiltAgent } from "@crow-central-agency/shared";
import { TagChip } from "../agents/artifact/tag-chip.js";

interface AvailableAgentsNoticeProps {
  agents: AgentBuilderBuiltAgent[];
}

export function AvailableAgentsNotice({ agents }: AvailableAgentsNoticeProps) {
  if (agents.length === 0) {
    return null;
  }

  return (
    <div className="mx-6 mt-3 flex flex-col gap-2 rounded-md border border-info/20 bg-info/10 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-info">
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>Already available — reused for this fleet, not rebuilt.</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {agents.map((agent) => (
          <TagChip key={agent.id} label={agent.name} />
        ))}
      </div>
    </div>
  );
}
