import { CROW_SYSTEM_AGENT_ID } from "@crow-central-agency/shared";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { SystemSettingsManager } from "../../services/system-settings-manager.js";

/**
 * Resolve which feed IDs an agent is allowed to see. For Super Crow, the list
 * comes from SystemSettingsManager (system agents cannot be edited through
 * the standard agent editor). For every other agent, the list comes from
 * agentConfig.configuredFeeds.
 *
 * @param registry Only consulted when agentId !== CROW_SYSTEM_AGENT_ID.
 */
export async function resolveVisibleFeedIds(
  agentId: string,
  registry: AgentRegistry,
  systemSettingsManager: SystemSettingsManager
): Promise<Set<string>> {
  if (agentId === CROW_SYSTEM_AGENT_ID) {
    const settings = await systemSettingsManager.getSuperCrowSettings();
    return new Set(settings.configuredFeeds.map((entry) => entry.feedId));
  }

  const agentConfig = registry.getAgent(agentId);
  return new Set((agentConfig.configuredFeeds ?? []).map((entry) => entry.feedId));
}
