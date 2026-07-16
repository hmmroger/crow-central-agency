import type { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";

/** Replace the agent's active-domain set with the nearest DOMAINs of the touched fragment; unchanged when none resolves. */
export async function signalActiveDomain(
  agentId: string,
  touchedFragmentId: string,
  fragmentManager: FragmentManager,
  runtimeManager: AgentRuntimeManager
): Promise<void> {
  const domainFragmentIds = await fragmentManager.resolveDomain(touchedFragmentId);
  if (domainFragmentIds.length > 0) {
    await runtimeManager.setActiveDomains(agentId, domainFragmentIds);
  }
}
