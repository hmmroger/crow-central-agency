import type { Fragment } from "@crow-central-agency/shared";
import type { FragmentManager } from "./fragment-manager.js";
import type { FragmentCueIndexEntry } from "./fragment-manager.types.js";

/**
 * Compose the dispatch prompt for one reflection run: the focus fragments in full
 * (content plus where each currently sits — parents, ancestor cues, sibling cues)
 * and the target's first-level map. The agent pulls anything deeper itself via
 * read_fragment / search_fragment.
 */
export async function composeReflectionContext(
  fragmentManager: FragmentManager,
  targetAgentId: string,
  focusFragments: Fragment[]
): Promise<string> {
  const firstLevelCues = await fragmentManager.getFirstLevelFragmentCues(targetAgentId);
  const firstLevelIds = new Set(firstLevelCues.map((cueEntry) => cueEntry.id));

  const lines: string[] = [
    `Reflect on the memory fragments of target agent ${targetAgentId}.`,
    "",
    "## New fragments since the last sweep",
  ];

  for (const fragment of focusFragments) {
    const parents = await fragmentManager.getParentFragmentCues(fragment.id);
    const parentLabels = parents.map(renderCueRef);
    if (firstLevelIds.has(fragment.id)) {
      parentLabels.unshift("the target agent (top-level anchor)");
    }

    lines.push("", `### [${fragment.id}] (${fragment.kind}) ${fragment.cue}`);
    lines.push(`Body: ${fragment.body}`);
    lines.push(`Parents: ${parentLabels.join(", ")}`);

    const ancestors = await collectAncestorCues(fragmentManager, parents);
    if (ancestors.length > 0) {
      lines.push(`Ancestors: ${ancestors.map(renderCueRef).join(", ")}`);
    }

    const siblings = await collectSiblingCues(fragmentManager, parents, fragment.id);
    if (siblings.length > 0) {
      lines.push(`Siblings: ${siblings.map(renderCueRef).join(", ")}`);
    }
  }

  lines.push("", "## Target's first-level map");
  lines.push(...firstLevelCues.map((cueEntry) => `- ${renderCueRef(cueEntry)}`));

  lines.push("", "Return your reorganization plan as specified — one JSON object between the markers, nothing else.");

  return lines.join("\n");
}

function renderCueRef(cueEntry: FragmentCueIndexEntry): string {
  return `[${cueEntry.id}] (${cueEntry.kind}) ${cueEntry.cue}`;
}

/** Walk upward beyond the direct parents, collecting each distinct ancestor's cue once */
async function collectAncestorCues(
  fragmentManager: FragmentManager,
  directParents: FragmentCueIndexEntry[]
): Promise<FragmentCueIndexEntry[]> {
  const visited = new Set(directParents.map((cueEntry) => cueEntry.id));
  const ancestors: FragmentCueIndexEntry[] = [];
  const queue = [...directParents];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      continue;
    }

    for (const parent of await fragmentManager.getParentFragmentCues(current.id)) {
      if (visited.has(parent.id)) {
        continue;
      }

      visited.add(parent.id);
      ancestors.push(parent);
      queue.push(parent);
    }
  }

  return ancestors;
}

/** The focus fragment's siblings: each direct parent's other children, deduplicated */
async function collectSiblingCues(
  fragmentManager: FragmentManager,
  directParents: FragmentCueIndexEntry[],
  focusFragmentId: string
): Promise<FragmentCueIndexEntry[]> {
  const seen = new Set<string>([focusFragmentId]);
  const siblings: FragmentCueIndexEntry[] = [];

  for (const parent of directParents) {
    for (const child of await fragmentManager.getChildFragmentCues(parent.id)) {
      if (seen.has(child.id)) {
        continue;
      }

      seen.add(child.id);
      siblings.push(child);
    }
  }

  return siblings;
}
