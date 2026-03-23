import type { OpenAIProvider } from "./openai-provider.js";
import type { GenerationConfig } from "./md-generation-service.types.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "md-generation" });

/**
 * Generates personas and AGENT.md content via an OpenAI-compatible API.
 * Optional — requires OPENAI_BASE_URL to be configured.
 */
export class MdGenerationService {
  constructor(
    private readonly provider: OpenAIProvider,
    private readonly model: string
  ) {}

  /** Generate a persona for an agent based on its name and description */
  async generatePersona(config: GenerationConfig): Promise<string> {
    const systemPrompt =
      "You are an expert at crafting AI agent personas. Generate a concise, focused persona that defines the agent's behavior, expertise, and communication style. Be specific and actionable.";

    const userPrompt = [
      `Generate a persona for an AI agent with the following details:`,
      `Name: ${config.agentName}`,
      `Description: ${config.agentDescription}`,
      config.existingPersona ? `Current persona (improve upon this): ${config.existingPersona}` : "",
      "",
      "The persona should be 2-4 paragraphs covering: role, expertise areas, communication style, and key behaviors.",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await this.generate(systemPrompt, userPrompt);

    log.info({ agentName: config.agentName }, "Persona generated");

    return result;
  }

  /** Generate AGENT.md content for an agent */
  async generateAgentMd(config: GenerationConfig): Promise<string> {
    const systemPrompt =
      "You are an expert at writing AGENT.md files for AI coding agents. Generate clear, structured markdown instructions that guide an agent's behavior in a development context.";

    const userPrompt = [
      `Generate an AGENT.md file for an AI agent:`,
      `Name: ${config.agentName}`,
      `Description: ${config.agentDescription}`,
      config.existingPersona ? `Persona: ${config.existingPersona}` : "",
      "",
      "Include sections for: Overview, Key Responsibilities, Guidelines, and Constraints.",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await this.generate(systemPrompt, userPrompt);

    log.info({ agentName: config.agentName }, "AGENT.md generated");

    return result;
  }

  /** Internal: generate text via the OpenAI provider */
  private async generate(systemPrompt: string, userPrompt: string): Promise<string> {
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

    return result;
  }
}
