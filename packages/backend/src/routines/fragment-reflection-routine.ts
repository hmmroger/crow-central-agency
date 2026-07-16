import {
  FRAGMENT_REFLECTION_AGENT_ID,
  MESSAGE_SOURCE_TYPE,
  ReflectionPlanSchema,
  type Fragment,
  type ReflectionPlan,
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
import { logger } from "../utils/logger.js";

const ROUTINE_ID = "fragment-reflection";
const REFLECTION_INTERVAL_MINUTES = 30;
const MAX_REFLECTION_FAILURES = 2;

const log = logger.child({ context: "fragment-reflection-routine" });

/**
 * Periodic reflection sweep: per tick, for every user-facing agent with fragments
 * created past its watermark, dispatch one reflection run and apply the returned plan.
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
    const targetAgents = this.registry.getAllAgents();
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
    const state = await this.reflectionStateStore.getState(agentId);
    const focusFragments = await this.findFragmentsNewerThanWatermark(agentId, state.lastReflectionSweepTimestamp);
    if (focusFragments.length === 0) {
      return;
    }

    const prompt = await composeReflectionContext(this.fragmentManager, agentId, focusFragments);

    let plan: ReflectionPlan;
    let raw: string | undefined;
    try {
      raw = await this.runtimeManager.runAgentForResult(FRAGMENT_REFLECTION_AGENT_ID, prompt, {
        sourceType: MESSAGE_SOURCE_TYPE.INTERNAL,
      });
      plan = extractMarkedJson(raw ?? "", ReflectionPlanSchema, FRAGMENT_REFLECTION_BEGIN, FRAGMENT_REFLECTION_END);
    } catch (error) {
      if (raw !== undefined) {
        log.debug({ agentId, rawPlan: raw }, "Reflection plan validation failed.");
      }

      const failureCount = state.failureCount + 1;
      if (failureCount >= MAX_REFLECTION_FAILURES) {
        await this.reflectionStateStore.setState(agentId, {
          lastReflectionSweepTimestamp: sweepStart,
          failureCount: 0,
        });
        log.error(
          { agentId, error, failureCount },
          "Reflection run failed too many times; advancing watermark past this fragment set"
        );
        return;
      }

      await this.reflectionStateStore.setState(agentId, {
        lastReflectionSweepTimestamp: state.lastReflectionSweepTimestamp,
        failureCount,
      });
      log.warn({ agentId, error, failureCount }, "Reflection run failed; will retry on the next tick");
      return;
    }

    const { failures, collectedIds } = await applyReflectionPlan(this.fragmentManager, agentId, plan);
    if (failures.length > 0) {
      log.warn({ agentId, failures }, "Some reflection plan operations failed to apply");
    }

    for (const collectedId of collectedIds) {
      await this.runtimeManager.clearActiveDomain(agentId, collectedId);
    }

    // accept trade off on new fragments added mid-run by target agent
    await this.reflectionStateStore.setState(agentId, { lastReflectionSweepTimestamp: Date.now(), failureCount: 0 });
    log.info(
      { agentId, newFragments: focusFragments.length, operations: plan.operations.length, failures: failures.length },
      "Reflection sweep applied"
    );
  }

  /** The new set N: scoped fragments whose cue-index createdTimestamp is past the agent's watermark */
  private async findFragmentsNewerThanWatermark(agentId: string, watermark: number): Promise<Fragment[]> {
    const scopedFragmentIds = this.fragmentManager.getScopedFragmentIds(agentId);
    const cueEntries = await this.fragmentManager.getFragmentCues(Array.from(scopedFragmentIds));

    const focusFragments: Fragment[] = [];
    for (const cueEntry of cueEntries) {
      if (cueEntry.createdTimestamp > watermark) {
        focusFragments.push(await this.fragmentManager.readFragment(cueEntry.id));
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
