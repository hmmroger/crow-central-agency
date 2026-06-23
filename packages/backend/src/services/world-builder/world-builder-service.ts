import {
  CROW_NARRATIVE_ARCHITECT_AGENT_ID,
  CROW_WORLD_BUILDER_AGENT_ID,
  MESSAGE_SOURCE_TYPE,
  GENERATION_TYPE,
  ENTITY_TYPE,
  RELATIONSHIP_TYPE,
  BASE_CIRCLE_ID,
  DEFAULT_AGENT_TYPE,
  type GenerateRequest,
  type AgentBuilderDraft,
  type AgentBuilderBuildResult,
  type AgentType,
  type AgentConfig,
  type FleetAgent,
  type AgentBuilderDraftView,
  type FleetAgentView,
  FleetResponseSchema,
} from "@crow-central-agency/shared";
import type { AgentRuntimeManager } from "../runtime/agent-runtime-manager.js";
import type { AgentRegistry } from "../agent-registry.js";
import type { AgentCircleManager } from "../agent-circle-manager.js";
import type { CrowMcpManager } from "../../mcp/crow-mcp-manager.js";
import type { WorldBuilderDraftStore } from "./world-builder-draft-store.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import { logger } from "../../utils/logger.js";
import { composeGenerationInstruction } from "./instruction-composer.js";
import { composeFleetInstruction } from "./fleet-instruction-composer.js";
import { extractMarked, extractMarkedJson } from "./extract-marked.js";

const log = logger.child({ context: "world-builder-service" });

export class WorldBuilderService {
  constructor(
    private readonly runtimeManager: AgentRuntimeManager,
    private readonly draftStore: WorldBuilderDraftStore,
    private readonly registry: AgentRegistry,
    private readonly circleManager: AgentCircleManager,
    private readonly mcpManager: CrowMcpManager
  ) {}

  /** Produce a persona or AGENT.md for the given request. */
  public async generateAgentText(request: GenerateRequest): Promise<string> {
    const instruction = composeGenerationInstruction(request);
    const raw = await this.runtimeManager.runAgentForResult(CROW_NARRATIVE_ARCHITECT_AGENT_ID, instruction, {
      sourceType: MESSAGE_SOURCE_TYPE.INTERNAL,
    });
    const content = extractMarked(raw ?? "");
    if (!content) {
      log.warn({ type: request.type }, "Narrative Architect returned empty content");
      throw new AppError("Generation produced no content", APP_ERROR_CODES.SDK_ERROR);
    }

    return content;
  }

  /** Get the single active draft as a resolved view, or undefined when none has been designed. */
  public async getDraft(): Promise<AgentBuilderDraftView | undefined> {
    const draft = await this.draftStore.getDraft();
    return draft ? this.toDraftView(draft) : undefined;
  }

  /**
   * Run the World Builder to design (or refine) a fleet for the requirement and persist it as the draft.
   * An existing draft with a non-empty fleet is refined; otherwise a fresh fleet is created. The draft's
   * projectPath is preserved and the agents are replaced with the full returned fleet.
   */
  public async design(input: string): Promise<AgentBuilderDraftView> {
    const existing = await this.draftStore.getDraft();
    const currentAgents = existing?.agents.length ? existing.agents : undefined;

    const instruction = composeFleetInstruction({ input, currentAgents });
    const raw = await this.runtimeManager.runAgentForResult(CROW_WORLD_BUILDER_AGENT_ID, instruction, {
      sourceType: MESSAGE_SOURCE_TYPE.INTERNAL,
    });
    const fleet = extractMarkedJson(raw ?? "", FleetResponseSchema);

    const draft: AgentBuilderDraft = {
      projectPath: existing?.projectPath,
      agentType: existing?.agentType,
      agents: fleet.agents,
    };
    const saved = await this.draftStore.saveDraft(draft);
    return this.toDraftView(saved);
  }

  /**
   * Replace the draft's fleet-level config (project path + agent type), preserving the designed agents.
   * Replace semantics: omitting a field clears it, so callers must send the complete desired config.
   */
  public async setFleetConfig(config: { projectPath?: string; agentType?: AgentType }): Promise<AgentBuilderDraftView> {
    const trimmed = config.projectPath?.trim();
    const normalized = trimmed ? trimmed : undefined;
    const existing = await this.draftStore.getDraft();
    const saved = await this.draftStore.saveDraft({
      projectPath: normalized,
      agentType: config.agentType,
      agents: existing?.agents ?? [],
    });
    return this.toDraftView(saved);
  }

  /** Clear the active draft entirely. */
  public async resetDraft(): Promise<void> {
    await this.draftStore.clearDraft();
  }

  /**
   * Build the drafted fleet: author each agent's persona (and AGENT.md when briefed), create it, and
   * place it in its circles. Best-effort and sequential — a failed agent does not abort the rest.
   * Succeeded agents leave the draft; failed agents are kept so the build can be retried. The draft is
   * cleared only when every agent succeeds.
   */
  public async build(): Promise<AgentBuilderBuildResult> {
    const draft = await this.draftStore.getDraft();
    if (!draft || draft.agents.length === 0) {
      return { created: [], failed: [] };
    }

    const created: AgentBuilderBuildResult["created"] = [];
    const failed: AgentBuilderBuildResult["failed"] = [];
    const remaining: FleetAgent[] = [];

    for (const agent of draft.agents) {
      try {
        const builtAgent = await this.buildAgent(agent, draft);
        created.push({ id: builtAgent.id, name: builtAgent.name });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn({ name: agent.name, error: message }, "Failed to build fleet agent");
        failed.push({ name: agent.name, error: message });
        remaining.push(agent);
      }
    }

    if (failed.length === 0) {
      await this.draftStore.clearDraft();
    } else {
      await this.draftStore.saveDraft({
        projectPath: draft.projectPath,
        agentType: draft.agentType,
        agents: remaining,
      });
    }

    return { created, failed };
  }

  /**
   * Resolve a stored draft into its frontend-facing view: each agent's `mcpServerIds`/`circleIds` are
   * mapped to friendly names so the UI never surfaces raw ids. Unknown ids fall back to the id itself.
   */
  private toDraftView(draft: AgentBuilderDraft): AgentBuilderDraftView {
    const circleNameById = new Map(this.circleManager.getAllCircles().map((circle) => [circle.id, circle.name]));

    const agents: FleetAgentView[] = draft.agents.map((agent) => ({
      name: agent.name,
      description: agent.description,
      personaBrief: agent.personaBrief,
      agentMdBrief: agent.agentMdBrief,
      mcpServers: (agent.mcpServerIds ?? []).map((id) => ({
        id,
        name: this.mcpManager.getMcpServerDisplayName(id) ?? id,
      })),
      circles: (agent.circleIds ?? []).map((id) => ({ id, name: circleNameById.get(id) ?? id })),
    }));

    return { projectPath: draft.projectPath, agentType: draft.agentType, agents };
  }

  /**
   * Author and create a single drafted agent. Circle ids are validated up front, before any side
   * effect, so a placement failure after the agent is created is near-impossible.
   */
  private async buildAgent(agent: FleetAgent, draft: AgentBuilderDraft): Promise<AgentConfig> {
    if (agent.circleIds?.length) {
      for (const circleId of agent.circleIds) {
        this.circleManager.getCircle(circleId);
      }
    }

    const persona = await this.generateAgentText({
      type: GENERATION_TYPE.PERSONA,
      prompt: agent.personaBrief,
      name: agent.name,
      description: agent.description,
    });
    const agentMd = agent.agentMdBrief
      ? await this.generateAgentText({
          type: GENERATION_TYPE.AGENT_MD,
          prompt: agent.agentMdBrief,
          name: agent.name,
          description: agent.description,
        })
      : undefined;

    const builtAgent = await this.registry.createAgent({
      type: draft.agentType ?? DEFAULT_AGENT_TYPE,
      name: agent.name,
      description: agent.description,
      persona,
      agentMd,
      workspace: draft.projectPath,
      mcpServerIds: agent.mcpServerIds,
    });

    if (agent.circleIds?.length) {
      await this.placeInCircles(builtAgent.id, agent.circleIds);
    }

    return builtAgent;
  }

  private async placeInCircles(agentId: string, circleIds: string[]): Promise<void> {
    const targetCircleIds = circleIds.filter((circleId) => circleId !== BASE_CIRCLE_ID);
    if (targetCircleIds.length === 0) {
      return;
    }

    for (const circleId of targetCircleIds) {
      await this.circleManager.createRelationship({
        sourceEntityId: circleId,
        sourceEntityType: ENTITY_TYPE.AGENT_CIRCLE,
        targetEntityId: agentId,
        targetEntityType: ENTITY_TYPE.AGENT,
        relationshipType: RELATIONSHIP_TYPE.MEMBERSHIP,
      });
    }

    const baseMemberships = this.circleManager.queryRelationships({
      sourceEntityId: BASE_CIRCLE_ID,
      sourceEntityType: ENTITY_TYPE.AGENT_CIRCLE,
      targetEntityId: agentId,
      targetEntityType: ENTITY_TYPE.AGENT,
      relationshipType: RELATIONSHIP_TYPE.MEMBERSHIP,
    });
    for (const membership of baseMemberships) {
      await this.circleManager.deleteRelationship(membership.id);
    }
  }
}
