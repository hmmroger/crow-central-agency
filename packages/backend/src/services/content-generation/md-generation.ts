import { env } from "../../config/env.js";
import { createModelMessage } from "../../utils/message-template.js";
import type { MessageTemplate } from "../../utils/message-template.types.js";
import { streamTextGeneration } from "./text-generation-service.js";
import { MessageRoles } from "./content-generation.types.js";

const PERSONA_SYSTEM_PROMPT: MessageTemplate = {
  role: MessageRoles.system,
  content: [
    {
      content: [
        "You are a helpful assistant that generates concise agent persona descriptions.",
        "A persona is a short system prompt addition that defines the agent's identity, tone, and behavior.",
        "It should be 1-3 sentences that clearly describe who the agent is and how it should respond.",
        "Write only the persona text, no extra commentary or formatting.",
      ],
    },
  ],
};

const AGENTMD_SYSTEM_PROMPT: MessageTemplate = {
  role: MessageRoles.system,
  content: [
    {
      content: [
        "You are a helpful assistant that generates agent instruction files in markdown format.",
        "An AGENT.md file provides persistent context loaded into every agent session.",
        "It should include relevant instructions, guidelines, and context for the agent to follow.",
        "Use clear markdown structure with headers and bullet points.",
        "Write only the markdown content, no extra commentary or wrapping.",
      ],
    },
  ],
};

export async function generatePersona(prompt: string, context?: string): Promise<string> {
  return generateWithSystemPrompt(PERSONA_SYSTEM_PROMPT, prompt, context);
}

export async function generateAgentMd(prompt: string, context?: string): Promise<string> {
  return generateWithSystemPrompt(AGENTMD_SYSTEM_PROMPT, prompt, context);
}

async function generateWithSystemPrompt(
  systemPrompt: MessageTemplate,
  prompt: string,
  context?: string
): Promise<string> {
  const userPrompt = context ? `${prompt}\n\nContext:\n${context}` : prompt;

  let result = "";
  const stream = streamTextGeneration(
    env.TEXT_GENERATION_MODEL ?? "default",
    [createModelMessage(userPrompt, MessageRoles.user)],
    {
      systemPrompt,
    }
  );

  for await (const event of stream) {
    if (event.type === "content") {
      result += event.content;
    }
  }

  return result;
}
