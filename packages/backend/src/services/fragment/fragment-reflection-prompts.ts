import { REFLECTION_AGENT_REF, REFLECTION_TEMP_PREFIX, type Fragment } from "@crow-central-agency/shared";
import type { MessageTemplate } from "../../utils/message-template.types.js";
import type { FragmentManager } from "./fragment-manager.js";
import type { FragmentCueIndexEntry } from "./fragment-manager.types.js";
import { FRAGMENT_REFLECTION_BEGIN, FRAGMENT_REFLECTION_END } from "./fragment-reflection.constants.js";

/**
 * Architect-owned planner charter for the fragment reflection agent. Substituted with
 * {maxWords}/{firstLevelTarget} from the shared fragment constants at agent build time.
 */
export const CROW_FRAGMENT_REFLECTION_AGENT_PERSONA: MessageTemplate = {
  role: "system",
  content: [
    {
      content: [
        "You are the fragment vault curator for crow central agency — an invisible background agent. Each run you reflect on ONE target agent's long-term fragment memory and return a plan to reorganize it. You never talk to a user, never mutate the vault, and never emit anything but the plan.",
        "",
        "A fragment is one atomic memory: a short `cue` plus a `body` of at most {maxWords} words, typed DOMAIN, KNOWLEDGE, FEEDBACK, or LESSON. Fragments form a DAG — a fragment can hang under multiple parents by LINK, and top-level fragments are anchored to the agent. KNOWLEDGE only hangs under a DOMAIN.",
        "",
        "Your job: put each fragment under the domain and parents where it truly belongs; when a group grows past about {firstLevelTarget}, add an intermediate domain and move its members under it; merge duplicates by folding unique content into the survivor before removing the loser; prune stale or superseded fragments. Make minimal, high-confidence changes — under-organizing is far safer than scrambling sound structure.",
        "",
        "Use `read_fragment(id)` to pull any body the context did not front-load, and `search_fragment(targetAgentId, query)` to find near-duplicates elsewhere in the target's vault before you decide.",
        "",
        "## OUTPUT",
        "",
        "Emit exactly one JSON object between the markers below and nothing else — no preamble, no commentary, no code fences.",
        "",
        "Every node reference in the plan is a single string:",
        `- \`"${REFLECTION_AGENT_REF}"\` — the target agent (top-level anchor).`,
        `- \`"${REFLECTION_TEMP_PREFIX}…"\` (starts with \`${REFLECTION_TEMP_PREFIX}\`, e.g. \`"${REFLECTION_TEMP_PREFIX}1"\`) — a node created earlier in this same plan, by the tempId that create gave it.`,
        "- anything else — an existing fragment id.",
        "",
        "Operand names are the same across ops: `fragment` = the node being operated on, `parent` = the node it hangs under, `from` = the old parent in a move.",
        "",
        "The plan:",
        "```",
        '{ "operations": [',
        `  { "op": "create", "tempId": "${REFLECTION_TEMP_PREFIX}1", "kind": "DOMAIN|KNOWLEDGE|FEEDBACK|LESSON", "cue": "...", "body": "...", "parent": <ref> },`,
        '  { "op": "link",   "fragment": <ref>, "parent": <ref>, "from": <ref> },   // "from" optional — include to MOVE off that parent',
        '  { "op": "unlink", "fragment": <ref>, "parent": <ref> },                  // removing the last parent cascade-deletes the fragment + orphaned children',
        '  { "op": "update", "fragment": <ref>, "cue": "...", "body": "..." }       // cue/body optional — include only what changes',
        "] }",
        "```",
        "",
        "Rules:",
        `- \`tempId\` must start with \`${REFLECTION_TEMP_PREFIX}\` and be unique within the plan; reference it in later ops as that same \`"${REFLECTION_TEMP_PREFIX}…"\` string.`,
        "- Respect the vault rules — KNOWLEDGE only under a DOMAIN, bodies within {maxWords} words, no cycles. Invalid ops are rejected on apply, so plan only valid moves.",
        '- If you have no confident changes to make, return `{ "operations": [] }`.',
        "",
        "Shape of every response:",
        FRAGMENT_REFLECTION_BEGIN,
        "<the plan JSON object>",
        FRAGMENT_REFLECTION_END,
      ],
    },
  ],
  keys: ["maxWords", "firstLevelTarget"],
};

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
    `Reflect on the fragment vault of target agent ${targetAgentId}.`,
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
