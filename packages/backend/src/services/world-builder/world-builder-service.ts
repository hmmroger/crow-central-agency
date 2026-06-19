import { CROW_NARRATIVE_ARCHITECT_AGENT_ID, type GenerateRequest } from "@crow-central-agency/shared";
import type { AgentRuntimeManager } from "../runtime/agent-runtime-manager.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import { logger } from "../../utils/logger.js";
import { composeGenerationInstruction } from "./instruction-composer.js";
import { extractGenerated } from "./extract-generated.js";

const log = logger.child({ context: "world-builder-service" });

/**
 * Authors agent personas and AGENT.md by running the internal Narrative Architect agent for a single
 * turn and extracting its sentinel-wrapped artifact. Backed by the regular run-agent flow, so no
 * external text-generation provider is required.
 */
export class WorldBuilderService {
  constructor(private readonly runtimeManager: AgentRuntimeManager) {}

  /** Produce a persona or AGENT.md for the given request. */
  public async generateAgentText(request: GenerateRequest): Promise<string> {
    const instruction = composeGenerationInstruction(request);
    const raw = await this.runtimeManager.runAgentForResult(CROW_NARRATIVE_ARCHITECT_AGENT_ID, instruction);
    const content = extractGenerated(raw ?? "").trim();
    if (!content) {
      log.warn({ type: request.type }, "Narrative Architect returned empty content");
      throw new AppError("Generation produced no content", APP_ERROR_CODES.SDK_ERROR);
    }

    return content;
  }
}
