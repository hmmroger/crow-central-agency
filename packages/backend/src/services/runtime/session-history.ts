import {
  MAX_SESSION_HISTORY,
  type AgentConfig,
  type BranchPoint,
  type SessionHistory,
  type SessionHistoryNode,
} from "@crow-central-agency/shared";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import type { SessionHistoryUpdate, UpdatedSessionHistory } from "./session-history.types.js";

interface SessionFamilies {
  roots: SessionHistory[];
  childrenByParentId: Map<string, SessionHistory[]>;
  familyMaxByRootId: Map<string, number>;
}

export const SESSION_LABEL_MAX_WORDS = 15;
const SESSION_LABEL_ELLIPSIS = "...";

export function deriveSessionLabel(message: string): string {
  const words = message
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length <= SESSION_LABEL_MAX_WORDS) {
    return words.join(" ");
  }

  return words.slice(0, SESSION_LABEL_MAX_WORDS).join(" ") + SESSION_LABEL_ELLIPSIS;
}

/**
 * Update the ledger with the session a turn runs in, and with it the tree standing over the ledger.
 */
export function updateSessionHistory(
  history: SessionHistory[] | undefined,
  sessionTree: SessionHistoryNode[],
  update: SessionHistoryUpdate
): UpdatedSessionHistory {
  const entries = history ?? [];
  const existingEntry = entries.find((entry) => entry.sessionId === update.sessionId);
  if (existingEntry === undefined) {
    entries.push({
      sessionId: update.sessionId,
      lastUpdatedTimestamp: update.timestamp,
      label: deriveSessionLabel(update.message),
      branchPoint: update.branchPoint,
    });
    const retainedEntries = evictSessionFamilies(entries);
    return { history: retainedEntries, sessionTree: buildSessionTree(retainedEntries) };
  }

  existingEntry.lastUpdatedTimestamp = update.timestamp;
  if (refreshLeadingFamilyNode(sessionTree, update.sessionId, update.timestamp)) {
    return { history: entries };
  }

  return { history: entries, sessionTree: buildSessionTree(entries) };
}

/** Refreshes the session's node where the tree leads with its family, reporting whether it did. */
function refreshLeadingFamilyNode(sessionTree: SessionHistoryNode[], sessionId: string, timestamp: number): boolean {
  for (const [index, node] of sessionTree.entries()) {
    // A root past the first one ends the leading family.
    if (index > 0 && node.depth === 0) {
      return false;
    }

    if (node.sessionId === sessionId) {
      node.lastUpdatedTimestamp = timestamp;
      return true;
    }
  }

  return false;
}

function evictSessionFamilies(entries: SessionHistory[]): SessionHistory[] {
  if (entries.length <= MAX_SESSION_HISTORY) {
    return entries;
  }

  const familyRoots: string[] = [];
  const rootBySessionId = new Map<string, string>();
  for (const entry of entries) {
    const parentSessionId = entry.branchPoint?.sessionId;
    const parentRoot = parentSessionId === undefined ? undefined : rootBySessionId.get(parentSessionId);
    const familyRoot = parentRoot ?? entry.sessionId;
    familyRoots.push(familyRoot);
    rootBySessionId.set(entry.sessionId, familyRoot);
  }

  const retainedRoots = new Set(familyRoots.slice(entries.length - MAX_SESSION_HISTORY));

  return entries.filter((_unused, index) => retainedRoots.has(familyRoots[index]));
}

/** Reject a branch the agent cannot make. The caller owns the runner, so it gates on IDLE itself. */
export function assertBranchSource(
  agent: AgentConfig,
  sessionHistory: SessionHistory[] | undefined,
  branchPoint: BranchPoint
): void {
  if (agent.persistSession === false) {
    throw new AppError(
      "This agent does not persist sessions, so there is nothing to branch from.",
      APP_ERROR_CODES.VALIDATION
    );
  }

  const sourceEntry = sessionHistory?.find((entry) => entry.sessionId === branchPoint.sessionId);
  if (!sourceEntry) {
    throw new AppError(
      `Session ${branchPoint.sessionId} is no longer available to branch from.`,
      APP_ERROR_CODES.SESSION_NOT_FOUND
    );
  }
}

export function assertSwitchTarget(sessionHistory: SessionHistory[] | undefined, sessionId: string): void {
  const targetEntry = sessionHistory?.find((entry) => entry.sessionId === sessionId);
  if (!targetEntry) {
    throw new AppError(`Session ${sessionId} is no longer available to switch to.`, APP_ERROR_CODES.SESSION_NOT_FOUND);
  }
}

function resolveParentLinks(entries: SessionHistory[]): Map<string, string> {
  const ledgerSessionIds = new Set(entries.map((entry) => entry.sessionId));
  const parentBySessionId = new Map<string, string>();

  for (const entry of entries) {
    const parentSessionId = entry.branchPoint?.sessionId;
    if (parentSessionId !== undefined && ledgerSessionIds.has(parentSessionId)) {
      parentBySessionId.set(entry.sessionId, parentSessionId);
    }
  }

  return parentBySessionId;
}

function resolveRootSessionId(sessionId: string, parentBySessionId: Map<string, string>): string {
  let rootSessionId = sessionId;
  let parentSessionId = parentBySessionId.get(rootSessionId);
  while (parentSessionId !== undefined) {
    rootSessionId = parentSessionId;
    parentSessionId = parentBySessionId.get(rootSessionId);
  }

  return rootSessionId;
}

function groupFamilies(entries: SessionHistory[], parentBySessionId: Map<string, string>): SessionFamilies {
  const roots: SessionHistory[] = [];
  const childrenByParentId = new Map<string, SessionHistory[]>();
  const familyMaxByRootId = new Map<string, number>();

  for (const entry of entries) {
    const parentSessionId = parentBySessionId.get(entry.sessionId);
    if (parentSessionId === undefined) {
      roots.push(entry);
    } else {
      const siblings = childrenByParentId.get(parentSessionId);
      if (siblings) {
        siblings.push(entry);
      } else {
        childrenByParentId.set(parentSessionId, [entry]);
      }
    }

    const rootSessionId = resolveRootSessionId(entry.sessionId, parentBySessionId);
    const familyMax = familyMaxByRootId.get(rootSessionId);
    if (familyMax === undefined || entry.lastUpdatedTimestamp > familyMax) {
      familyMaxByRootId.set(rootSessionId, entry.lastUpdatedTimestamp);
    }
  }

  return { roots, childrenByParentId, familyMaxByRootId };
}

function appendSubtree(
  entry: SessionHistory,
  depth: number,
  childrenByParentId: Map<string, SessionHistory[]>,
  nodes: SessionHistoryNode[]
): void {
  nodes.push({
    sessionId: entry.sessionId,
    label: entry.label,
    lastUpdatedTimestamp: entry.lastUpdatedTimestamp,
    depth,
    isBranch: entry.branchPoint !== undefined,
  });

  for (const child of childrenByParentId.get(entry.sessionId) ?? []) {
    appendSubtree(child, depth + 1, childrenByParentId, nodes);
  }
}

/**
 * Project an agent's session ledger into the ordered, depth-annotated list the session panel renders.
 *
 * Families are ordered by the most recent timestamp anywhere in the family, so the family being worked
 * in leads. Inside a family the shape is fixed: a root is followed by its children depth-first in the
 * order they were branched, so a session keeps its place and the fork structure stays readable.
 */
export function buildSessionTree(sessionHistory: SessionHistory[] | undefined): SessionHistoryNode[] {
  const entries = sessionHistory ?? [];
  const parentBySessionId = resolveParentLinks(entries);
  const { roots, childrenByParentId, familyMaxByRootId } = groupFamilies(entries, parentBySessionId);

  roots.sort(
    (left, right) =>
      (familyMaxByRootId.get(right.sessionId) ?? right.lastUpdatedTimestamp) -
      (familyMaxByRootId.get(left.sessionId) ?? left.lastUpdatedTimestamp)
  );

  const nodes: SessionHistoryNode[] = [];
  for (const root of roots) {
    appendSubtree(root, 0, childrenByParentId, nodes);
  }

  return nodes;
}
