import { AGENT_BUILDER_LIMITS, AGENT_BUILDER_WORD_BUDGET, type FleetResponse } from "@crow-central-agency/shared";
import { WORLD_BUILDER_BEGIN, WORLD_BUILDER_END } from "./world-builder.constants.js";

export interface FleetInstructionContext {
  input: string;
  currentAgents?: FleetResponse["agents"];
}

function appendTaskFraming(lines: string[], input: string, currentAgents: FleetResponse["agents"] | undefined): void {
  if (currentAgents?.length) {
    lines.push(
      "Refine the fleet you previously designed. The current fleet is:",
      "",
      JSON.stringify(currentAgents, null, 2),
      "",
      "Apply the refinement below and return the COMPLETE updated fleet — every agent that should exist",
      "after the change, not only the ones you touch.",
      "",
      "Refinement:",
      input.trim()
    );
    return;
  }

  lines.push("Design a fleet of agents that fully satisfies the requirement below.", "", "Requirement:", input.trim());
}

function appendSurveyStep(lines: string[]): void {
  lines.push(
    "",
    "Before designing, survey the existing ecosystem with your perception tools: list the agents that",
    "already exist (inspecting any whose role overlaps the requirement) and list the MCP servers you can",
    "assign. Design agents that complement what already exists rather than duplicate covered roles, and",
    "draw every mcpServerIds entry from the ids those tools return — never invent one."
  );
}

function appendDataContract(lines: string[]): void {
  lines.push(
    "",
    "Return a single JSON object of exactly this shape:",
    '  { "agents": [ { "name", "description", "personaBrief", "agentMdBrief"?, "mcpServerIds"?, "circleIds"? } ] }',
    "",
    "Field rules — each value becomes part of the built agent; stay within each word budget (hard limits):",
    `  - name (required, <= ${AGENT_BUILDER_LIMITS.NAME} characters): concrete, specific, user-facing agent name.`,
    `  - description (required, MUST be under ${AGENT_BUILDER_WORD_BUDGET.DESCRIPTION} words): a high-level summary of the`,
    "    ROLE this agent fills, abstract over implementation. It is injected into every PEER agent's context so",
    "    they can decide when to delegate, so keep it concise and concrete about WHAT the agent is for — never",
    "    its tech stack, languages, frameworks, or tools.",
    `  - personaBrief (required, MUST be under ${AGENT_BUILDER_WORD_BUDGET.PERSONA_BRIEF} words): a directive to the`,
    "    authoring specialist about WHO the agent is — its character, temperament, values, and speaking register.",
    "    Identity ONLY: do not mention capabilities, tools, tech stack, or how it works. Write it TO the author,",
    "    not as the persona itself.",
    `  - agentMdBrief (optional, MUST be under ${AGENT_BUILDER_WORD_BUDGET.AGENT_MD_BRIEF} words): a directive for the`,
    "    agent's AGENT.md — the operating manual it follows. ALL implementation detail (tech stack, tools,",
    "    conventions, do/don't rules, procedure) belongs here, never in description or personaBrief. Include it",
    "    only for a role that needs explicit procedure; omit it for a persona-only agent.",
    "  - mcpServerIds (optional): each assigned server grants the agent that integration's tools/capabilities;",
    "    assign only servers whose tools the role actually needs, and omit when it needs none.",
    "  - circleIds (optional): circles group agents that work together and see each other as peers; place the",
    "    agent in the circles where it collaborates, or omit to leave it in the base circle.",
    "",
    "Design the smallest fleet that fully covers the requirement, with at least one agent and every agent",
    "holding a distinct, non-overlapping role."
  );
}

export function composeFleetInstruction(context: FleetInstructionContext): string {
  const lines: string[] = [];

  appendTaskFraming(lines, context.input, context.currentAgents);
  appendSurveyStep(lines);
  appendDataContract(lines);

  lines.push(
    "",
    `Emit ONLY the JSON object, wrapped exactly between ${WORLD_BUILDER_BEGIN} and ${WORLD_BUILDER_END} on ` +
      "their own lines, with no other text, commentary, or code fences."
  );

  return lines.join("\n");
}
