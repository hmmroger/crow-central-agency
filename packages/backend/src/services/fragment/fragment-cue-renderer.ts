import { FRAGMENT_KIND } from "@crow-central-agency/shared";
import type { FragmentManager } from "./fragment-manager.js";

const FIRST_LEVEL_SECTIONS = [
  { kind: FRAGMENT_KIND.DOMAIN, heading: "### Domains" },
  { kind: FRAGMENT_KIND.FEEDBACK, heading: "### Feedback" },
  { kind: FRAGMENT_KIND.LESSON, heading: "### Lessons" },
] as const;

/**
 * Render the hot-tier `{fragmentCues}` system-prompt block: the agent's first-level
 * association cues grouped by kind, plus the active domain's direct-child cues.
 * Cue-index reads only — never fragment bodies, and rendering does not count as a
 * recall. Returns undefined when there is nothing to inject.
 */
export async function renderFragmentCues(
  agentId: string,
  activeDomainFragmentId: string | undefined,
  fragmentManager: FragmentManager
): Promise<string | undefined> {
  const firstLevelCues = await fragmentManager.getFirstLevelFragmentCues(agentId);
  const activeDomain = activeDomainFragmentId
    ? await fragmentManager.getFragmentCue(activeDomainFragmentId)
    : undefined;
  if (firstLevelCues.length === 0 && !activeDomain) {
    return undefined;
  }

  const lines: string[] = ["## Fragment vault"];
  if (activeDomain) {
    lines.push(`Active domain: ${activeDomain.cue} (${activeDomain.id})`);
  }

  const sectionLines: string[] = [];
  for (const section of FIRST_LEVEL_SECTIONS) {
    const sectionCues = firstLevelCues.filter((cueEntry) => cueEntry.kind === section.kind);
    if (sectionCues.length === 0) {
      continue;
    }

    sectionLines.push(section.heading, ...sectionCues.map((cueEntry) => `- [${cueEntry.id}] ${cueEntry.cue}`));
  }

  if (sectionLines.length > 0) {
    lines.push("", ...sectionLines);
  }

  if (activeDomain) {
    const childCues = await fragmentManager.getChildFragmentCues(activeDomain.id);
    if (childCues.length > 0) {
      lines.push(
        "",
        `### Active domain — ${activeDomain.cue}`,
        ...childCues.map((cueEntry) => `- [${cueEntry.id}] (${cueEntry.kind}) ${cueEntry.cue}`)
      );
    }
  }

  return lines.join("\n");
}
