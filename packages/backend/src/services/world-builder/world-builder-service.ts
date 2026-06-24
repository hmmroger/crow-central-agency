import {
  CROW_NARRATIVE_ARCHITECT_AGENT_ID,
  CROW_WORLD_BUILDER_AGENT_ID,
  MESSAGE_SOURCE_TYPE,
  GENERATION_TYPE,
  ENTITY_TYPE,
  RELATIONSHIP_TYPE,
  BASE_CIRCLE_ID,
  DEFAULT_AGENT_TYPE,
  AGENT_BUILDER_DRAFT_STATUS,
  SERVER_MESSAGE_TYPE,
  type GenerateRequest,
  type AgentBuilderDraft,
  type AgentBuilderBuildResult,
  type AgentBuilderBuiltAgent,
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
import type { WsBroadcaster } from "../ws-broadcaster.js";
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
    private readonly mcpManager: CrowMcpManager,
    private readonly broadcaster: WsBroadcaster
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
    if (existing?.status === AGENT_BUILDER_DRAFT_STATUS.BUILDING) {
      throw new AppError("Cannot redesign while a fleet build is in progress", APP_ERROR_CODES.CONFLICT);
    }

    const currentAgents = existing?.agents.length ? existing.agents : undefined;

    const instruction = composeFleetInstruction({ input, currentAgents });
    const raw = await this.runtimeManager.runAgentForResult(CROW_WORLD_BUILDER_AGENT_ID, instruction, {
      sourceType: MESSAGE_SOURCE_TYPE.INTERNAL,
    });
    const fleet = extractMarkedJson(raw ?? "", FleetResponseSchema);

    const draft: AgentBuilderDraft = {
      projectPath: existing?.projectPath,
      agentType: existing?.agentType,
      status: AGENT_BUILDER_DRAFT_STATUS.READY,
      existingAgents: this.resolveExistingAgents(fleet.existingAgents),
      agents: fleet.agents,
    };
    const saved = await this.draftStore.saveDraft(draft);
    return this.broadcastDraft(saved);
  }

  /**
   * Replace the draft's fleet-level config (project path + agent type), preserving the designed agents.
   * Replace semantics: omitting a field clears it, so callers must send the complete desired config.
   */
  public async setFleetConfig(config: { projectPath?: string; agentType?: AgentType }): Promise<AgentBuilderDraftView> {
    const trimmed = config.projectPath?.trim();
    const normalized = trimmed ? trimmed : undefined;
    const existing = await this.draftStore.getDraft();
    if (existing?.status === AGENT_BUILDER_DRAFT_STATUS.BUILDING) {
      throw new AppError("Cannot change fleet config while a build is in progress", APP_ERROR_CODES.CONFLICT);
    }

    const saved = await this.draftStore.saveDraft({
      projectPath: normalized,
      agentType: config.agentType,
      status: AGENT_BUILDER_DRAFT_STATUS.READY,
      lastBuildResult: existing?.lastBuildResult,
      existingAgents: existing?.existingAgents,
      builtAgents: existing?.builtAgents,
      agents: existing?.agents ?? [],
    });
    return this.broadcastDraft(saved);
  }

  /** Clear the active draft entirely and notify clients the draft is gone. */
  public async resetDraft(): Promise<void> {
    await this.draftStore.clearDraft();
    this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.AGENT_BUILDER_DRAFT_UPDATED, draft: null });
  }

  /** Mark the draft BUILDING and run the build detached so the request does not block on it. */
  public async startBuild(): Promise<void> {
    const draft = await this.draftStore.getDraft();
    if (!draft || draft.agents.length === 0) {
      throw new AppError("No drafted fleet to build", APP_ERROR_CODES.NOT_FOUND);
    }

    if (draft.status === AGENT_BUILDER_DRAFT_STATUS.BUILDING) {
      throw new AppError("A fleet build is already in progress", APP_ERROR_CODES.CONFLICT);
    }

    if (draft.status === AGENT_BUILDER_DRAFT_STATUS.COMPLETED) {
      throw new AppError("Fleet is already built — acknowledge or discard the draft first", APP_ERROR_CODES.CONFLICT);
    }

    const building = await this.draftStore.saveDraft({
      projectPath: draft.projectPath,
      agentType: draft.agentType,
      status: AGENT_BUILDER_DRAFT_STATUS.BUILDING,
      lastBuildResult: undefined,
      existingAgents: draft.existingAgents,
      builtAgents: draft.builtAgents,
      agents: draft.agents,
    });
    this.broadcastDraft(building);

    void this.runBuild(building);
  }

  /** Resume a build left in BUILDING by a crash/restart; already-built agents are skipped. */
  public async recoverInterruptedBuild(): Promise<void> {
    const draft = await this.draftStore.getDraft();
    if (draft?.status !== AGENT_BUILDER_DRAFT_STATUS.BUILDING) {
      return;
    }

    log.info({ built: draft.builtAgents?.length ?? 0, total: draft.agents.length }, "Resuming interrupted fleet build");
    void this.runBuild(draft);
  }

  private async runBuild(draft: AgentBuilderDraft): Promise<void> {
    const builtAgents: AgentBuilderBuiltAgent[] = [...(draft.builtAgents ?? [])];
    const builtNames = new Set(builtAgents.map((builtAgent) => builtAgent.name));
    const failed: AgentBuilderBuildResult["failed"] = [];

    for (const agent of draft.agents) {
      if (builtNames.has(agent.name)) {
        continue;
      }

      try {
        const builtAgent = await this.buildAgent(agent, draft);
        builtAgents.push({ id: builtAgent.id, name: builtAgent.name });
        builtNames.add(builtAgent.name);
        const progress = await this.draftStore.saveDraft({
          projectPath: draft.projectPath,
          agentType: draft.agentType,
          status: AGENT_BUILDER_DRAFT_STATUS.BUILDING,
          existingAgents: draft.existingAgents,
          builtAgents,
          agents: draft.agents,
        });
        this.broadcastDraft(progress);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn({ name: agent.name, error: message }, "Failed to build fleet agent");
        failed.push({ name: agent.name, error: message });
      }
    }

    const allSucceeded = failed.length === 0;
    try {
      const saved = await this.draftStore.saveDraft({
        projectPath: draft.projectPath,
        agentType: draft.agentType,
        status: allSucceeded ? AGENT_BUILDER_DRAFT_STATUS.COMPLETED : AGENT_BUILDER_DRAFT_STATUS.READY,
        lastBuildResult: { created: builtAgents, failed },
        existingAgents: draft.existingAgents,
        builtAgents,
        agents: draft.agents,
      });
      this.broadcastDraft(saved);
    } catch (error) {
      // The draft stays BUILDING with builtAgents persisted; startup recovery resumes and retries.
      log.error({ error }, "Failed to persist fleet build outcome");
    }
  }

  private resolveExistingAgents(refs: AgentBuilderBuiltAgent[] | undefined): AgentBuilderBuiltAgent[] | undefined {
    if (!refs?.length) {
      return undefined;
    }

    const resolved: AgentBuilderBuiltAgent[] = [];
    for (const ref of refs) {
      try {
        resolved.push({ id: ref.id, name: this.registry.getAgentName(ref.id) });
      } catch {
        log.warn({ id: ref.id }, "World Builder referenced a non-existent agent; dropping it");
      }
    }

    return resolved.length ? resolved : undefined;
  }

  private broadcastDraft(draft: AgentBuilderDraft): AgentBuilderDraftView {
    const view = this.toDraftView(draft);
    this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.AGENT_BUILDER_DRAFT_UPDATED, draft: view });
    return view;
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

    return {
      projectPath: draft.projectPath,
      agentType: draft.agentType,
      status: draft.status,
      lastBuildResult: draft.lastBuildResult,
      existingAgents: draft.existingAgents,
      builtAgents: draft.builtAgents,
      agents,
    };
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
