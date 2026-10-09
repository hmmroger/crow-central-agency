import { useCallback, useMemo, useState } from "react";
import type { AgentConfig } from "@crow-central-agency/shared";
import { useAgentsContext } from "../../../providers/agents-provider.js";
import { useAppStore, VIEW_MODE } from "../../../stores/app-store.js";
import { getAgentAbbreviation } from "../../../utils/agent-abbreviation.js";
import { CommandPalette } from "../../common/command-palette/command-palette.js";
import { CommandPaletteSectionLabel } from "../../common/command-palette/command-palette-section-label.js";
import type { CommandPaletteItem } from "../../common/command-palette/command-palette.types.js";
import { AGENT_PALETTE_LABEL_ID, AGENT_PALETTE_MODE, type AgentPaletteMode } from "./agent-palette.types.js";
import { resolvePaletteAgents } from "./resolve-palette-agents.js";
import { AgentPaletteRowStatus } from "./agent-palette-row-status.js";

interface AgentPaletteDialogProps {
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

const MODE_LABEL: Record<AgentPaletteMode, string> = {
  [AGENT_PALETTE_MODE.RECENT]: "Recent",
  [AGENT_PALETTE_MODE.ALL]: "Agents",
  [AGENT_PALETTE_MODE.RESULTS]: "Results",
};

const MODE_EMPTY_MESSAGE: Record<AgentPaletteMode, string> = {
  [AGENT_PALETTE_MODE.RECENT]: "No recent agents",
  [AGENT_PALETTE_MODE.ALL]: "No other agents",
  [AGENT_PALETTE_MODE.RESULTS]: "No agents match",
};

const AGENT_PALETTE_ID_PREFIX = "agent-palette";

export function AgentPaletteDialog({ onClose }: AgentPaletteDialogProps) {
  const { agents } = useAgentsContext();
  const recentAgentIds = useAppStore((state) => state.recentAgentIds);
  const viewMode = useAppStore((state) => state.viewMode);
  const selectedAgentId = useAppStore((state) => state.selectedAgentId);
  const goToAgentConsole = useAppStore((state) => state.goToAgentConsole);
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const currentAgentId = viewMode === VIEW_MODE.AGENTS ? selectedAgentId : undefined;

  const list = useMemo(
    () => resolvePaletteAgents({ agents, recentAgentIds, currentAgentId, query: normalizedQuery }),
    [agents, recentAgentIds, currentAgentId, normalizedQuery]
  );

  const items = useMemo<CommandPaletteItem<AgentConfig>[]>(
    () =>
      list.entries.map(({ agent, isCurrent }) => ({
        key: agent.id,
        title: agent.name,
        subtitle: agent.description,
        leading: (
          <span className="flex items-center justify-center w-full h-full rounded-xs border border-border-subtle font-mono text-3xs">
            {getAgentAbbreviation(agent.name)}
          </span>
        ),
        trailing: <AgentPaletteRowStatus agentId={agent.id} isCurrent={isCurrent} />,
        value: agent,
      })),
    [list]
  );

  const handleSelect = useCallback(
    (agent: AgentConfig) => {
      goToAgentConsole(agent.id);
      onClose();
    },
    [goToAgentConsole, onClose]
  );

  return (
    <CommandPalette
      idPrefix={AGENT_PALETTE_ID_PREFIX}
      labelId={AGENT_PALETTE_LABEL_ID}
      title="Find agent"
      inputLabel="Search agents"
      placeholder="Search agents…"
      query={query}
      onQueryChange={setQuery}
      header={<CommandPaletteSectionLabel label={MODE_LABEL[list.mode]} />}
      items={items}
      emptyMessage={MODE_EMPTY_MESSAGE[list.mode]}
      onSelect={handleSelect}
    />
  );
}
