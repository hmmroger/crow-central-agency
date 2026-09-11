import type { AgentConfig } from "@crow-central-agency/shared";
import { AGENT_PALETTE_MODE, type AgentPaletteEntry, type AgentPaletteList } from "./agent-palette.types.js";

interface ResolvePaletteAgentsParams {
  agents: AgentConfig[];
  recentAgentIds: string[];
  /** Set only when an agent view is currently open */
  currentAgentId: string | undefined;
  query: string;
}

function toEntries(agents: AgentConfig[], currentAgentId: string | undefined): AgentPaletteEntry[] {
  return agents.map((agent) => ({ agent, isCurrent: agent.id === currentAgentId }));
}

function compareByName(agent1: AgentConfig, agent2: AgentConfig): number {
  return agent1.name.localeCompare(agent2.name);
}

/**
 * Decide which agents the palette lists and in what order.
 * Recency ids that no longer resolve to a live agent are dropped here.
 */
export function resolvePaletteAgents({
  agents,
  recentAgentIds,
  currentAgentId,
  query,
}: ResolvePaletteAgentsParams): AgentPaletteList {
  const needle = query.trim().toLowerCase();

  if (needle.length === 0) {
    const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
    const recentAgents: AgentConfig[] = [];

    for (const recentId of recentAgentIds) {
      const agent = agentsById.get(recentId);
      if (agent && agent.id !== currentAgentId) {
        recentAgents.push(agent);
      }
    }

    if (recentAgents.length > 0) {
      return { mode: AGENT_PALETTE_MODE.RECENT, entries: toEntries(recentAgents, currentAgentId) };
    }

    const allAgents = agents.filter((agent) => agent.id !== currentAgentId);
    allAgents.sort(compareByName);
    return { mode: AGENT_PALETTE_MODE.ALL, entries: toEntries(allAgents, currentAgentId) };
  }

  const recencyRank = new Map(recentAgentIds.map((recentId, index) => [recentId, index]));
  const unrankedPosition = recentAgentIds.length;
  const matches = agents.filter((agent) => agent.name.toLowerCase().includes(needle));

  matches.sort((agent1, agent2) => {
    const rank1 = recencyRank.get(agent1.id) ?? unrankedPosition;
    const rank2 = recencyRank.get(agent2.id) ?? unrankedPosition;
    if (rank1 !== rank2) {
      return rank1 - rank2;
    }

    return compareByName(agent1, agent2);
  });

  return { mode: AGENT_PALETTE_MODE.RESULTS, entries: toEntries(matches, currentAgentId) };
}
