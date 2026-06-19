import { GENERATION_TYPE, type GenerateRequest } from "@crow-central-agency/shared";
import { NARRATIVE_ARTIFACT_BEGIN, NARRATIVE_ARTIFACT_END } from "./world-builder.constants.js";

/** Directorial brief per (artifact, operation), selected by artifact type and whether a current draft exists. */
const OPERATION_BRIEF = {
  [GENERATION_TYPE.PERSONA]: {
    author:
      "Author a new agent persona from scratch. Define who this agent is: its role, the scope it owns, " +
      "how it reasons and makes decisions, how it collaborates, its voice, and its boundaries.",
    refine:
      "Refine the existing agent persona below. Preserve what already works and the established voice; " +
      "apply the requested change, sharpen weak or generic passages, and keep it coherent.",
  },
  [GENERATION_TYPE.AGENT_MD]: {
    author:
      "Generate a new AGENT.md operating manual from scratch: the agent's purpose, responsibilities, " +
      "conventions, and clear do/don't rules, organized with Markdown headings and tight bullet points.",
    refine:
      "Reinforce the existing AGENT.md below. Keep its working structure and rules; incorporate the " +
      "requested change, tighten vague guidance, and fill gaps without bloating it.",
  },
} as const;

const HINT_LABEL = {
  name: "Agent name",
  description: "Agent description",
  currentPersona: "Current persona (refine this)",
  currentAgentMd: "Current AGENT.md (reinforce this)",
} as const;

/** Append a labeled hint block to the instruction lines when the value is present and non-empty. */
function appendHint(lines: string[], label: string, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) {
    lines.push("", `${label}:`, trimmed);
  }
}

/**
 * Build the per-request instruction sent to the Narrative Architect. Carries the operation (author vs
 * refine/reinforce, derived from whether a current draft is present), the user's prompt, and the
 * structured hints, and restates the sentinel-wrapped output contract.
 */
export function composeGenerationInstruction(request: GenerateRequest): string {
  const { type, prompt, name, description, currentPersona, currentAgentMd } = request;
  const currentDraft = type === GENERATION_TYPE.PERSONA ? currentPersona : currentAgentMd;
  const operation = currentDraft?.trim() ? "refine" : "author";

  const lines: string[] = [OPERATION_BRIEF[type][operation], "", "Request:", prompt.trim()];

  appendHint(lines, HINT_LABEL.name, name);
  appendHint(lines, HINT_LABEL.description, description);
  if (type === GENERATION_TYPE.PERSONA) {
    appendHint(lines, HINT_LABEL.currentPersona, currentPersona);
  } else {
    appendHint(lines, HINT_LABEL.currentAgentMd, currentAgentMd);
  }

  lines.push(
    "",
    `Take cues from the hints above where present. Emit ONLY the finished artifact, wrapped exactly ` +
      `between ${NARRATIVE_ARTIFACT_BEGIN} and ${NARRATIVE_ARTIFACT_END} on their own lines, with no other text.`
  );

  return lines.join("\n");
}
