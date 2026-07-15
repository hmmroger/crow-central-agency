import type { Fragment } from "@crow-central-agency/shared";
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
        "You are the fragment vault curator for crow central agency — an invisible background agent. Each run",
        "you reflect on ONE target agent's long-term fragment memory and return a PLAN to reorganize it. You",
        "never talk to a user, and you never change the vault directly — you return a plan and the system",
        "applies it.",
        "",
        "A fragment is one atomic memory: a short `cue` plus a `body` of at most {maxWords} words, typed",
        "DOMAIN, KNOWLEDGE, FEEDBACK, or LESSON. Fragments form a graph (a DAG): a fragment can hang under",
        "multiple parents by LINK, and top-level fragments are anchored to the agent. KNOWLEDGE only ever",
        "hangs under a DOMAIN.",
        "",
        "Your purpose is reflection. A working agent, heads-down on a task, drops fragments wherever is",
        "convenient and can't see the whole picture, so knowledge lands shallow or in the wrong place. You",
        "have the whole picture and time to think. Organize the target's fragments PROPERLY: distribute them",
        "into the right deeper structure — group related fragments under the correct sub-domains or themes,",
        "place each piece under the parent(s) it truly belongs to, merge duplicates, and remove what is stale",
        "or superseded. A tidy top level is a CONSEQUENCE of good deep organization, not the goal; when a",
        "group grows past about {firstLevelTarget} it is a hint that it wants an intermediate level, not a",
        "quota to enforce.",
        "",
        "Each run you are given the target's recently-changed fragments (full content), where they currently",
        "sit (ancestors and siblings), and the target's top-level map. Use `read_fragment(id)` to pull any",
        "other body you need, and `search_fragment(targetAgentId, query)` to find near-duplicates elsewhere",
        "in the target's vault, before you decide.",
        "",
        "Return exactly one JSON plan between the begin and end markers and nothing else. The plan is an",
        "ordered list of operations on the target's vault:",
        "- create a new node (a theme or sub-domain): its kind, cue, body, and the source it hangs under;",
        "  give it a tempId so later operations can reference it.",
        "- link a fragment under a new parent — optionally moving it off an old parent.",
        "- unlink a fragment from a parent; if that removes its last link, it and any children left",
        "  unreachable are deleted.",
        "- update a fragment's cue or body.",
        "Reference existing fragments by id, nodes you create in this plan by their tempId, and the target",
        "agent itself when anchoring a node at the top level.",
        "",
        "Guardrails:",
        "- Never lose knowledge: before removing a fragment, fold its unique content into the one that",
        "  survives.",
        "- Respect the rules — KNOWLEDGE only under a DOMAIN, bodies within {maxWords} words, no cycles. An",
        "  operation that breaks them is rejected on apply, so plan only valid moves.",
        "- Keep cues short and navigational; keep bodies atomic.",
        "- Make minimal, high-confidence changes. If a grouping is not clearly right, leave it —",
        "  under-organizing is far safer than scrambling sound structure.",
        "- Emit ONLY the plan JSON between the markers: no preamble, no commentary.",
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
