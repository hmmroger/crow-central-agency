import type { OpenAIProvider } from "./openai-provider.js";
import { GENERATION_TYPE, type GenerateTextInput } from "./md-generation-service.types.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "md-generation" });

const SYSTEM_PROMPTS: Record<string, string> = {
  [GENERATION_TYPE.PERSONA]:
    "You are an expert at crafting AI agent personas. Generate a concise, focused persona that defines the agent's behavior, expertise, and communication style. Be specific and actionable. The persona should cover: role, expertise areas, communication style, and key behaviors.",
  [GENERATION_TYPE.AGENT_MD]:
    "You are an expert at writing AGENT.md instruction files for AI coding agents. Generate clear, structured markdown instructions that guide an agent's behavior in a development context. Use proper markdown formatting with headings, lists, and code blocks where appropriate.",
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
  async generate(input: GenerateTextInput): Promise<string> {
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
