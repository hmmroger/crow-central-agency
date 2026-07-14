import type { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";

/** Move the agent's active-domain signal to the nearest DOMAIN of the touched fragment; unchanged when none resolves. */
export async function signalActiveDomain(
  agentId: string,
  touchedFragmentId: string,
  fragmentManager: FragmentManager,
  runtimeManager: AgentRuntimeManager
): Promise<void> {
  const domainFragmentId = await fragmentManager.resolveDomain(touchedFragmentId);
  if (domainFragmentId !== undefined) {
    await runtimeManager.setActiveDomain(agentId, domainFragmentId);
  }
}
