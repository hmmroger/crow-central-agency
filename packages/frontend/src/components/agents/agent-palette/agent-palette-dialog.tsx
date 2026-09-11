import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import { Search } from "lucide-react";
import { useAgentsContext } from "../../../providers/agents-provider.js";
import { useActiveIndexNav } from "../../../hooks/use-active-index-nav.js";
import { useAppStore, VIEW_MODE } from "../../../stores/app-store.js";
import { AGENT_PALETTE_LABEL_ID, AGENT_PALETTE_MODE, type AgentPaletteMode } from "./agent-palette.types.js";
import { resolvePaletteAgents } from "./resolve-palette-agents.js";
import { AgentPaletteRow } from "./agent-palette-row.js";

interface AgentPaletteDialogProps {
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

const MODE_LABEL: Record<AgentPaletteMode, string> = {
  [AGENT_PALETTE_MODE.RECENT]: "Recent",
  [AGENT_PALETTE_MODE.ALL]: "Agents",
  [AGENT_PALETTE_MODE.RESULTS]: "Results",
};

const AGENT_PALETTE_LIST_ID = "agent-palette-list";
const AGENT_PALETTE_ROW_ID_PREFIX = "agent-palette-row-";

/**
 * Search-and-jump list of agents. Focus stays in the input for the whole
 * lifetime of the dialog; the highlighted row is published with aria-activedescendant.
 */
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

  const handleCommit = useCallback(
    (index: number) => {
      const entry = list.entries[index];
      if (!entry) {
        return;
      }

      goToAgentConsole(entry.agent.id);
      onClose();
    },
    [list, goToAgentConsole, onClose]
  );

  const { activeIndex, setActiveIndex, handleKeyDown } = useActiveIndexNav({
    itemCount: list.entries.length,
    resetToken: normalizedQuery,
    onCommit: handleCommit,
  });

  const handleQueryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  }, []);

  const activeRowId = list.entries[activeIndex] ? `${AGENT_PALETTE_ROW_ID_PREFIX}${activeIndex}` : undefined;

  return (
    <div className="flex flex-col overflow-hidden">
      <h2 id={AGENT_PALETTE_LABEL_ID} className="sr-only">
        Find agent
      </h2>

      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-subtle">
        <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        <input
          type="text"
          autoFocus
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          placeholder="Search agents…"
          aria-label="Search agents"
          role="combobox"
          aria-expanded
          aria-controls={AGENT_PALETTE_LIST_ID}
          aria-autocomplete="list"
          aria-activedescendant={activeRowId}
          className="min-w-0 flex-1 bg-transparent text-sm text-text-base placeholder:text-text-muted focus:outline-none"
        />
      </div>

      <div className="px-3 pt-2 pb-1 text-3xs uppercase tracking-wider text-text-muted" aria-hidden="true">
        {MODE_LABEL[list.mode]}
      </div>

      {list.entries.length === 0 && <p className="px-3 pb-3 text-sm text-text-muted">No agents match</p>}

      <div
        id={AGENT_PALETTE_LIST_ID}
        role="listbox"
        aria-labelledby={AGENT_PALETTE_LABEL_ID}
        className="flex flex-col gap-0.5 max-h-80 overflow-y-auto px-2 py-2"
      >
        {list.entries.map((entry, index) => (
          <AgentPaletteRow
            key={entry.agent.id}
            entry={entry}
            index={index}
            rowId={`${AGENT_PALETTE_ROW_ID_PREFIX}${index}`}
            isActive={index === activeIndex}
            onActivate={handleCommit}
            onHover={setActiveIndex}
          />
        ))}
      </div>
    </div>
  );
}
