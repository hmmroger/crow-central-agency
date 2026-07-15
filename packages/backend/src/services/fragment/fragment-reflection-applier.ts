import {
  ENTITY_TYPE,
  REFLECTION_AGENT_REF,
  REFLECTION_OP,
  REFLECTION_TEMP_PREFIX,
  type ReflectionOp,
  type ReflectionPlan,
} from "@crow-central-agency/shared";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import type { FragmentManager } from "./fragment-manager.js";
import type { FragmentParent } from "./fragment-manager.types.js";

/** A plan operation that threw during apply, with the reason it failed */
export interface ReflectionOpFailure {
  op: ReflectionOp;
  error: string;
}

export interface ReflectionApplyResult {
  failures: ReflectionOpFailure[];
  /** Fragments the unlink ops cascade-collected, parents first */
  collectedIds: string[];
}

/**
 * Apply a reflection plan against the target agent's vault, in order, through the
 * FragmentManager named-edge primitives. The `"agent"` sentinel resolves to the TARGET agent
 * (the vault being reorganized), never the reflection agent; a `$`-prefixed ref resolves
 * to the fragment an earlier create in the same plan produced. Best-effort: a throwing op
 * is recorded as a failure and the remaining ops still apply.
 */
export async function applyReflectionPlan(
  fragmentManager: FragmentManager,
  targetAgentId: string,
  plan: ReflectionPlan
): Promise<ReflectionApplyResult> {
  const createdIdsByTempId = new Map<string, string>();
  const failures: ReflectionOpFailure[] = [];
  const collectedIds: string[] = [];

  for (const op of plan.operations) {
    try {
      await applyOp(fragmentManager, targetAgentId, op, createdIdsByTempId, collectedIds);
    } catch (error) {
      failures.push({ op, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { failures, collectedIds };
}

async function applyOp(
  fragmentManager: FragmentManager,
  targetAgentId: string,
  op: ReflectionOp,
  createdIdsByTempId: Map<string, string>,
  collectedIds: string[]
): Promise<void> {
  switch (op.op) {
    case REFLECTION_OP.CREATE: {
      const parent = resolveNodeRef(op.parent, targetAgentId, createdIdsByTempId);
      const fragment = await fragmentManager.createFragment({
        kind: op.kind,
        cue: op.cue,
        body: op.body,
        parent,
      });
      createdIdsByTempId.set(op.tempId, fragment.id);

      return;
    }

    case REFLECTION_OP.LINK: {
      // Resolve every ref before mutating so an unresolvable ref never leaves a half-applied move
      const fragmentId = resolveFragmentId(op.fragment, createdIdsByTempId);
      const parent = resolveNodeRef(op.parent, targetAgentId, createdIdsByTempId);
      const from = op.from === undefined ? undefined : resolveNodeRef(op.from, targetAgentId, createdIdsByTempId);

      await addEdge(fragmentManager, parent, fragmentId);
      if (from === undefined) {
        return;
      }

      try {
        await removeEdge(fragmentManager, from, fragmentId);
      } catch (error) {
        // roll back the added edge so a failed move leaves the graph untouched
        await removeEdge(fragmentManager, parent, fragmentId);
        throw error;
      }

      return;
    }

    case REFLECTION_OP.UNLINK: {
      const fragmentId = resolveFragmentId(op.fragment, createdIdsByTempId);
      const parent = resolveNodeRef(op.parent, targetAgentId, createdIdsByTempId);
      const collected = await fragmentManager.unlinkFragment(parent, fragmentId);
      collectedIds.push(...collected);

      return;
    }

    case REFLECTION_OP.UPDATE: {
      const fragmentId = resolveFragmentId(op.fragment, createdIdsByTempId);
      await fragmentManager.updateFragment(fragmentId, { cue: op.cue, body: op.body });

      return;
    }
  }
}

/** Resolve a node ref string to the graph node it names: the target agent, an existing fragment, or a plan-created one */
function resolveNodeRef(ref: string, targetAgentId: string, createdIdsByTempId: Map<string, string>): FragmentParent {
  if (ref === REFLECTION_AGENT_REF) {
    return { entityType: ENTITY_TYPE.AGENT, entityId: targetAgentId };
  }

  return { entityType: ENTITY_TYPE.FRAGMENT, entityId: resolveFragmentId(ref, createdIdsByTempId) };
}

/** The op's fragment operand must name a fragment (existing or plan-created), never the agent */
function resolveFragmentId(ref: string, createdIdsByTempId: Map<string, string>): string {
  if (ref === REFLECTION_AGENT_REF) {
    throw new AppError("The agent cannot be the fragment operand of a plan operation", APP_ERROR_CODES.VALIDATION);
  }

  if (ref.startsWith(REFLECTION_TEMP_PREFIX)) {
    const createdId = createdIdsByTempId.get(ref);
    if (createdId === undefined) {
      throw new AppError(
        `Unresolved temp id "${ref}" — no earlier create in this plan produced it`,
        APP_ERROR_CODES.VALIDATION
      );
    }

    return createdId;
  }

  return ref;
}

function addEdge(fragmentManager: FragmentManager, parent: FragmentParent, fragmentId: string): Promise<unknown> {
  return parent.entityType === ENTITY_TYPE.AGENT
    ? fragmentManager.createAssociation(parent.entityId, fragmentId)
    : fragmentManager.createLink(parent.entityId, fragmentId);
}

function removeEdge(fragmentManager: FragmentManager, parent: FragmentParent, fragmentId: string): Promise<void> {
  return parent.entityType === ENTITY_TYPE.AGENT
    ? fragmentManager.removeAssociation(parent.entityId, fragmentId)
    : fragmentManager.removeLink(parent.entityId, fragmentId);
}
