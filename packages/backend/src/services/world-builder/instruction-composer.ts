import { GENERATION_TYPE, type GenerateRequest } from "@crow-central-agency/shared";
import { WORLD_BUILDER_BEGIN, WORLD_BUILDER_END } from "./world-builder.constants.js";

const OPERATION_BRIEF = {
  [GENERATION_TYPE.PERSONA]: {
    author:
      "Author a new agent persona from scratch: who this agent is — its role and character, inner voice " +
      "and temperament, and the register in which it speaks. Identity only — no workflows, tool usage, or " +
      "operating rules (those live in AGENT.md). Keep it tight: one or two short paragraphs of cohesive " +
      "prose, roughly 100 words or fewer, no labeled sections or headers.",
    refine:
      "Refine the existing agent persona below. Preserve what already works and the established voice; " +
      "apply the requested change and sharpen weak or generic passages. Keep it identity, not procedure — " +
      "move any operating rules out — and keep it tight: one or two short paragraphs of cohesive prose, " +
      "roughly 100 words or fewer, without labeled sections.",
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

function appendHint(lines: string[], label: string, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) {
    lines.push("", `${label}:`, trimmed);
  }
}

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
      `between ${WORLD_BUILDER_BEGIN} and ${WORLD_BUILDER_END} on their own lines, with no other text.`
  );

  return lines.join("\n");
}
