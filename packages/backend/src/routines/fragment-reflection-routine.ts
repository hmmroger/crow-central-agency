import {
  FRAGMENT_REFLECTION_AGENT_ID,
  MESSAGE_SOURCE_TYPE,
  ReflectionPlanSchema,
  type Fragment,
} from "@crow-central-agency/shared";
import type { Routine } from "./routine-manager.types.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { AgentRuntimeManager } from "../services/runtime/agent-runtime-manager.js";
import type { FragmentManager } from "../services/fragment/fragment-manager.js";
import type { FragmentReflectionStateStore } from "../services/fragment/fragment-reflection-state-store.js";
import { applyReflectionPlan } from "../services/fragment/fragment-reflection-applier.js";
import { composeReflectionContext } from "../services/fragment/fragment-reflection-prompts.js";
import {
  FRAGMENT_REFLECTION_BEGIN,
  FRAGMENT_REFLECTION_END,
} from "../services/fragment/fragment-reflection.constants.js";
import { extractMarkedJson } from "../utils/extract-marked.js";
import { isCrowSystemAgent } from "../utils/id-utils.js";
import { logger } from "../utils/logger.js";

const ROUTINE_ID = "fragment-reflection";
const REFLECTION_INTERVAL_MINUTES = 30;

const log = logger.child({ context: "fragment-reflection-routine" });

/**
 * The reflection sweep: per tick, for every user-facing agent with fragments created
 * since its watermark, dispatch one single-pass reflection run and apply the returned
 * plan against that agent's vault. The watermark advances to the sweep start only when
 * the run completed and the plan parsed and applied — per-op failures are logged but
 * still count as completed, so the same sweep is never re-run forever; a thrown
 * run/parse leaves the watermark for the next tick to retry. Using the sweep start
 * (not completion time) means nodes the apply itself creates surface once in a
 * follow-up sweep that finds an organized vault and terminates as a no-op.
 */
class FragmentReflectionRoutine {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly runtimeManager: AgentRuntimeManager,
    private readonly fragmentManager: FragmentManager,
    private readonly reflectionStateStore: FragmentReflectionStateStore
  ) {}

  public createRoutine(): Routine {
    return {
      id: ROUTINE_ID,
      priority: 50,
      intervalInMinutes: REFLECTION_INTERVAL_MINUTES,
      onInterval: () => this.onInterval(),
    };
  }

  private async onInterval(): Promise<void> {
    const targetAgents = this.registry.getAllAgents().filter((agent) => !isCrowSystemAgent(agent.id));
    for (const agent of targetAgents) {
      try {
        await this.reflectOnAgent(agent.id);
      } catch (error) {
        log.error({ agentId: agent.id, error }, "Reflection run failed; watermark left so the next tick retries");
      }
    }
  }

  private async reflectOnAgent(agentId: string): Promise<void> {
    const sweepStart = Date.now();
    const focusFragments = await this.findFragmentsNewerThanWatermark(agentId);
    if (focusFragments.length === 0) {
      return;
    }

    const prompt = await composeReflectionContext(this.fragmentManager, agentId, focusFragments);
    await this.runtimeManager.newSession(FRAGMENT_REFLECTION_AGENT_ID);
    const raw = await this.runtimeManager.runAgentForResult(FRAGMENT_REFLECTION_AGENT_ID, prompt, {
      sourceType: MESSAGE_SOURCE_TYPE.INTERNAL,
    });
    const plan = extractMarkedJson(raw ?? "", ReflectionPlanSchema, FRAGMENT_REFLECTION_BEGIN, FRAGMENT_REFLECTION_END);

    const { failures, collectedIds } = await applyReflectionPlan(this.fragmentManager, agentId, plan);
    if (failures.length > 0) {
      log.warn({ agentId, failures }, "Some reflection plan operations failed to apply");
    }

    for (const collectedId of collectedIds) {
      await this.runtimeManager.clearActiveDomain(agentId, collectedId);
    }

    await this.reflectionStateStore.setLastSweepTimestamp(agentId, sweepStart);
    log.info(
      { agentId, newFragments: focusFragments.length, operations: plan.operations.length, failures: failures.length },
      "Reflection sweep applied"
    );
  }

  /** The new set N: scoped fragments whose cue-index createdTimestamp is past the agent's watermark */
  private async findFragmentsNewerThanWatermark(agentId: string): Promise<Fragment[]> {
    const watermark = (await this.reflectionStateStore.getLastSweepTimestamp(agentId)) ?? 0;
    const scopedFragmentIds = this.fragmentManager.getScopedFragmentIds(agentId);

    const focusFragments: Fragment[] = [];
    for (const fragmentId of scopedFragmentIds) {
      const cueEntry = await this.fragmentManager.getFragmentCue(fragmentId);
      if (cueEntry && cueEntry.createdTimestamp > watermark) {
        focusFragments.push(await this.fragmentManager.readFragment(fragmentId));
      }
    }

    return focusFragments;
  }
}

export function createFragmentReflectionRoutine(
  registry: AgentRegistry,
  runtimeManager: AgentRuntimeManager,
  fragmentManager: FragmentManager,
  reflectionStateStore: FragmentReflectionStateStore
): Routine {
  const instance = new FragmentReflectionRoutine(registry, runtimeManager, fragmentManager, reflectionStateStore);

  return instance.createRoutine();
}
