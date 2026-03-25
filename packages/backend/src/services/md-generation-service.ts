import type { OpenAIProvider } from "./openai-provider.js";
import { GENERATION_TYPE, type GenerateTextInput } from "./md-generation-service.types.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "md-generation" });

const SYSTEM_PROMPTS: Record<string, string> = {
  [GENERATION_TYPE.PERSONA]: `You are a helpful assistant that generates concise agent persona descriptions.
A persona is a short system prompt addition that defines the agent's identity, tone, and behavior.
It should be 1-3 sentences that clearly describe who the agent is and how it should respond.
Write only the persona text, no extra commentary or formatting.`,
  [GENERATION_TYPE.AGENT_MD]: `You are a helpful assistant that generates agent instruction files in markdown format.
An AGENT.md file provides persistent context loaded into every agent session.
It should include relevant instructions, guidelines, and context for the agent to follow.
Use clear markdown structure with headers and bullet points.
Write only the markdown content, no extra commentary or wrapping.`,
};

/**
 * Text generation via an OpenAI-compatible API.
 * Uses type-specific system prompts with user-provided instructions.
 * Optional — requires OPENAI_BASE_URL to be configured.
 */
export class MdGenerationService {
  constructor(
    private readonly provider: OpenAIProvider,
    private readonly model: string
  ) {}

  /** Generate text based on type, user prompt, and optional context */
  public async generate(input: GenerateTextInput): Promise<string> {
    const systemPrompt = SYSTEM_PROMPTS[input.type];
    const userPrompt = input.context ? `${input.prompt}\n\nContext:\n${input.context}` : input.prompt;

    let result = "";

    const stream = this.provider.streamTextGeneration(this.model, [
      { role: "system", content: systemPrompt, timestamp: Date.now() },
      { role: "user", content: userPrompt, timestamp: Date.now() },
    ]);

    for await (const event of stream) {
      if (event.type === "content") {
        result += event.content;
      }
    }

    log.info({ type: input.type }, "Text generated");

    return result;
  }
}
