import {
  AGENT_STATUS,
  ENTITY_TYPE,
  MESSAGE_SOURCE_TYPE,
  CROW_NARRATIVE_ARCHITECT_AGENT_ID,
  CROW_WORLD_BUILDER_AGENT_ID,
  type AgentConfig,
  type AgentStatus,
  type PendingInstructionReminder,
} from "@crow-central-agency/shared";
import { EventBus } from "../core/event-bus/event-bus.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { logger } from "../utils/logger.js";
import type { MessageTemplate } from "../utils/message-template.types.js";
import { createMessageContentFromTemplate, getDefaultPromptContext } from "../utils/message-template.js";
import { MessageRoles } from "../services/content-generation/content-generation.types.js";
import { INVOKE_AGENT_TOOL_NAME } from "../mcp/agents/invoke-agent.js";
import { SEARCH_WORKSPACE_TOOL_NAME } from "../mcp/agents/search-workspace.js";
import { FEED_MCP_SERVER_NAME } from "../mcp/feed/feed-mcp-server.js";
import { FRAGMENTS_MCP_SERVER_NAME } from "../mcp/fragments/fragments-mcp-server.js";
import {
  AGENT_STREAM_EVENT_TYPE,
  type AgentRunnerEvents,
  type AgentRunQueryRequest,
  type AgentStreamEvent,
} from "./agent-runner.types.js";
import type { CrowMcpManager } from "../mcp/crow-mcp-manager.js";
import { isCrowSystemAgent } from "../utils/id-utils.js";
import type { SensorManager } from "../sensors/sensor-manager.js";
import type { SensorContext } from "../sensors/sensor-manager.types.js";
import type { MessageSource } from "../services/message-queue-manager.types.js";
import type { AgentCircleManager } from "../services/agent-circle-manager.js";
import type { FragmentManager } from "../services/fragment/fragment-manager.js";
import type { AgentRuntimeManager } from "../services/runtime/agent-runtime-manager.js";
import { renderFragmentCues } from "../services/fragment/fragment-cue-renderer.js";
import { ADD_REMINDER_TOOL_NAME } from "../mcp/reminders/add-reminder.js";
import type { CrowMcpServerConfig } from "../mcp/crow-mcp-manager.types.js";
import { GMAIL_MCP_SERVER_NAME } from "../mcp/gmail/gmail-mcp-server.js";
import { CONNECTOR_ID } from "../connectors/connector-manager.types.js";

const DEFAULT_SYSTEM_PROMPT: MessageTemplate = {
  role: MessageRoles.system,
  content: [
    {
      content: ["# Your identity", "", "Your agent ID is: {agentId}", "Your name is: {agentName}"],
    },
    {
      content: ["Your email is: {agentEmail}"],
      keys: ["agentEmail"],
    },
    { content: [""] },
    { content: ["## Core persona", "", "{persona}", ""], keys: ["persona"] },
    {
      content: [
        "## Agent Context",
        "",
        "Avoid speculation and never fabricate data or sources. Be transparent if you do not have enough information.",
        "You have artifact tools for storing and retrieving information that can be referenced later by you or other agents.",
        "Save useful knowledge as artifacts. When a task finally succeeds after user feedback, record the preferred workflow that worked so you can reuse it next time.",
        `Do not assume information is unavailable just because it is not in your current context - use the "${SEARCH_WORKSPACE_TOOL_NAME}" tool to look it up first.`,
        `If you commit to follow up on something later or need to act at a specific time, use ${ADD_REMINDER_TOOL_NAME} to schedule a reminder that surfaces the work back to you when due.`,
        "",
      ],
    },
    {
      content: [
        "## Circles",
        "",
        "You belong to the following circles:",
        "{agentCircles}",
        "",
        "Each circle has shared artifacts accessible to its direct members via circle artifact tools.",
        "",
      ],
      keys: ["agentCircles"],
    },
    {
      content: [
        `The following agents are available for collaboration with the "${INVOKE_AGENT_TOOL_NAME}" tool from the crow-agents MCP server:`,
        "{peerAgents}",
        `If a task does not fall explicitly within your own scope, check whether a peer agent is better suited and use the "${INVOKE_AGENT_TOOL_NAME}" tool from the crow-agents MCP server to delegate.`,
        "Do NOT attempt to perform tasks that fall under another agent's responsibility - invoke that agent instead.",
        `When ${INVOKE_AGENT_TOOL_NAME} is used, must NOT respond until ALL invoked agents have returned results. Consolidate everything into one response.`,
        "",
      ],
      keys: ["peerAgents"],
    },
    {
      content: [
        `## Feeds`,
        "",
        `You have access to the "${FEED_MCP_SERVER_NAME}" MCP server with tools for discovering and reading subscribed RSS and podcast feeds.`,
        "Use its tools to list feeds, fetch recent or specific feed items, search feeds by query, and retrieve the full content of a feed item.",
        "",
      ],
      keys: ["hasFeedMcp"],
    },
    {
      content: ["## AGENT.md", "", "{agentMd}"],
      keys: ["agentMd"],
    },
    {
      content: ["", "## Environment", "", "The current date is {currentDate}", "The current time is {currentTime}."],
    },
    {
      content: ["{sensorReadings}"],
      keys: ["sensorReadings"],
    },
    {
      content: [
        "",
        "## Memory",
        "",
        "You have a persistent fragment vault — your long-term memory across sessions; curating it is part of the work.",
        "- Capture a fragment when you learn something durable that should change how you act later: a user correction or preference, a lesson from how a task turned out, or a stable fact worth reusing. One atomic point each; skip transient detail.",
        "- Before acting, build on the fragments already surfaced to you — file each new one under the right domain and link related ones instead of restating what you know.",
        "- Organize deeply, not as a flat list: distributing fragments into the right domains and deeper nodes is what keeps recall sharp.",
      ],
      keys: ["hasFragmentTools"],
    },
    {
      content: ["", "{fragmentCues}"],
      keys: ["fragmentCues"],
    },
  ],
  keys: [
    "currentDate",
    "currentTime",
    "agentId",
    "agentName",
    "agentEmail",
    "persona",
    "agentCircles",
    "peerAgents",
    "hasFeedMcp",
    "agentMd",
    "sensorReadings",
    "hasFragmentTools",
    "fragmentCues",
  ],
};

const CROW_SYSTEM_PROMPT: MessageTemplate = {
  role: MessageRoles.system,
  content: [
    { content: ["# Your identity", "", "Your agent ID is: {agentId}", "Your name is: {agentName}", ""] },
    { content: ["## Core persona", "", "{persona}", ""], keys: ["persona"] },
    {
      content: [
        "## Agent Context",
        "",
        "You have access to `crow-tasks` tools for getting task details by ID, create task, and assign task.",
        "You have artifact tools for storing and retrieving information that can be referenced later by you or other agents.",
        "Save useful knowledge as artifacts. When a task finally succeeds after user feedback, record the preferred workflow that worked so you can reuse it next time.",
        `Do not assume information is unavailable just because it is not in your current context - use the "${SEARCH_WORKSPACE_TOOL_NAME}" tool to look it up first.`,
        `If you commit to follow up on something later or need to act at a specific time, use ${ADD_REMINDER_TOOL_NAME} to schedule a reminder that surfaces the work back to you when due.`,
        "",
      ],
    },
    {
      content: [
        "## Circles",
        "",
        "Circles currently in the system:",
        "{agentCircles}",
        "",
        "Each circle has shared artifacts accessible to its direct members via circle artifact tools.",
        "",
      ],
      keys: ["agentCircles"],
    },
    {
      content: [
        `The following agents are available for task delegation with the "${INVOKE_AGENT_TOOL_NAME}" tool from the crow-agents MCP server:`,
        "{peerAgents}",
        `When ${INVOKE_AGENT_TOOL_NAME} is used, must NOT respond until ALL invoked agents have returned results. Consolidate everything into one response.`,
        "",
      ],
      keys: ["peerAgents"],
    },
    {
      content: [
        `## Feeds`,
        "",
        `You have access to the "${FEED_MCP_SERVER_NAME}" MCP server with tools for discovering and reading subscribed RSS and podcast feeds.`,
        "Use its tools to list feeds, fetch recent or specific feed items, search feeds by query, and retrieve the full content of a feed item.",
        "",
      ],
      keys: ["hasFeedMcp"],
    },
    {
      content: ["", "## Environment", "", "The current date is {currentDate}", "The current time is {currentTime}."],
    },
    {
      content: ["{sensorReadings}"],
      keys: ["sensorReadings"],
    },
  ],
  keys: [
    "currentDate",
    "currentTime",
    "agentId",
    "agentName",
    "persona",
    "agentCircles",
    "peerAgents",
    "hasFeedMcp",
    "sensorReadings",
  ],
};

const NARRATIVE_ARCHITECT_SYSTEM_PROMPT: MessageTemplate = {
  role: MessageRoles.system,
  content: [
    { content: ["# Your identity", "", "Your agent ID is: {agentId}", "Your name is: {agentName}", ""] },
    { content: ["## Core persona", "", "{persona}", ""], keys: ["persona"] },
    { content: ["## Environment", "", "The current date is {currentDate}", "The current time is {currentTime}."] },
  ],
  keys: ["agentId", "agentName", "persona", "currentDate", "currentTime"],
};

const WORLD_BUILDER_SYSTEM_PROMPT: MessageTemplate = {
  role: MessageRoles.system,
  content: [
    { content: ["# Your identity", "", "Your agent ID is: {agentId}", "Your name is: {agentName}", ""] },
    { content: ["## Core persona", "", "{persona}", ""], keys: ["persona"] },
    {
      content: ["## Circles", "", "Circles currently in the system:", "{agentCircles}", ""],
      keys: ["agentCircles"],
    },
    { content: ["## Environment", "", "The current date is {currentDate}", "The current time is {currentTime}."] },
  ],
  keys: ["agentId", "agentName", "persona", "agentCircles", "currentDate", "currentTime"],
};

const INSTRUCTION_REMINDER_INTRO =
  "Your operating instructions changed since this conversation started. Earlier turns followed the previous version — follow the current version below from now on, even where it differs from how you have behaved so far in this conversation.";
const INSTRUCTION_REMINDER_PERSONA_CLEARED = "(Your persona has been cleared.)";
const INSTRUCTION_REMINDER_AGENT_MD_CLEARED = "(Your AGENT.md has been cleared.)";

const log = logger.child({ context: "agent-runner" });

export abstract class AgentRunner extends EventBus<AgentRunnerEvents> {
  private agentStatus: AgentStatus;
  private abortController?: AbortController;
  private injectedMessages?: string[];

  constructor(
    protected readonly agentId: string,
    private readonly registry: AgentRegistry,
    private readonly mcpManager: CrowMcpManager,
    private readonly sensorManager: SensorManager,
    private readonly circleManager: AgentCircleManager,
    private readonly fragmentManager: FragmentManager,
    private readonly runtimeManager: AgentRuntimeManager
  ) {
    super();
    this.agentStatus = AGENT_STATUS.IDLE;
  }

  public getAgentStatus(): AgentStatus {
    return this.agentStatus;
  }

  /**
   * Send a message to an agent - runs a query turn and processes the stream.
   * If the agent is busy, the message is transparently enqueued and processed
   * when the agent becomes idle.
   */
  public async *sendMessage(
    message: string,
    messageSource: MessageSource,
    sessionId?: string,
    instructionReminder?: PendingInstructionReminder
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    const agentConfig = this.registry.getAgent(this.agentId);
    let nextMessage: string | undefined = message;
    let nextMessageSource = messageSource;
    let pendingReminder = instructionReminder;
    while (nextMessage || (nextMessage !== undefined && nextMessageSource.sourceType === MESSAGE_SOURCE_TYPE.COMMAND)) {
      const agentStream = this.runQuery(nextMessage, nextMessageSource, agentConfig, sessionId, pendingReminder);
      for await (const agentStreamEvent of agentStream) {
        yield agentStreamEvent;
      }

      pendingReminder = undefined;
      // Injected messages not delivered mid-stream are sent as the next turn. The messages are assumed to be from user via injected WS request.
      nextMessage = this.drainInjectedMessages();
      nextMessageSource = { sourceType: MESSAGE_SOURCE_TYPE.USER };
      if (nextMessage) {
        log.info({ agentId: this.agentId }, "Delivering injected messages post query.");
      }
    }
  }

  /**
   * Inject a message into an active agent stream.
   * The message is buffered and delivered by the provider subclass according to its capabilities
   * (e.g. as a systemMessage via the next tool-use hook), falling back to the next query turn.
   */
  public injectMessage(text: string): void {
    if (!this.abortController) {
      throw new AppError(`Agent ${this.agentId} is not streaming`, APP_ERROR_CODES.AGENT_NOT_RUNNING);
    }

    if (!this.injectedMessages) {
      this.injectedMessages = [];
    }

    this.injectedMessages.push(text);
    log.info({ agentId: this.agentId }, "Message buffered for injection.");
  }

  public async abort(): Promise<void> {
    this.abortController?.abort();
    await this.cancelProviderQuery();
  }

  /**
   * Release provider-level resources held across turns (e.g. a persistent SDK client). Called on
   * agent deletion after {@link abort}. The base runner holds no such resources; providers that cache
   * a client override this.
   */
  public async dispose(): Promise<void> {
    // No persistent resources in the base runner.
  }

  /**
   * Run a single provider query turn, yielding normalized stream events from the underlying SDK.
   * Implementations read `request.abortController` to wire cancellation into the provider call and
   * must let errors propagate so the base can synthesize the terminal ERROR event.
   */
  protected abstract runProviderQuery(request: AgentRunQueryRequest): AsyncGenerator<AgentStreamEvent, void, unknown>;

  /** Cancel the in-flight provider query, if any (provider-specific teardown). */
  protected abstract cancelProviderQuery(): void | Promise<void>;

  /** Take and clear any buffered injected messages, joined into a single message. */
  protected drainInjectedMessages(): string | undefined {
    const injectedMessages = this.injectedMessages;
    if (!injectedMessages?.length) {
      return undefined;
    }

    this.injectedMessages = undefined;
    return injectedMessages.join("\n\n");
  }

  private async *runQuery(
    message: string,
    messageSource: MessageSource,
    agentConfig: AgentConfig,
    sessionId?: string,
    instructionReminder?: PendingInstructionReminder
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    this.updateAgentStatus(AGENT_STATUS.ACTIVATING, messageSource);

    const serverConfigs = await this.mcpManager.getMcpServersForAgent(this.agentId);
    const sensorContext = await this.sensorManager.getSensorContext();
    const agentMd = await this.registry.getAgentMd(this.agentId);
    const systemPrompt = await this.buildSystemPrompt(agentConfig, sensorContext, serverConfigs, agentMd);
    const cwd = this.registry.resolveWorkspace(agentConfig);

    this.abortController = new AbortController();
    const request: AgentRunQueryRequest = {
      message,
      messageSource,
      sessionId,
      cwd,
      agentConfig,
      systemPrompt,
      instructionReminder: this.buildInstructionReminder(agentConfig, agentMd, instructionReminder),
      timezone: sensorContext.timezone,
      serverConfigs,
      abortController: this.abortController,
    };

    this.updateAgentStatus(AGENT_STATUS.STREAMING, messageSource);

    let resolvedSessionId = sessionId;
    try {
      let hasDone = false;
      for await (const agentStreamEvent of this.runProviderQuery(request)) {
        if (!resolvedSessionId) {
          resolvedSessionId = agentStreamEvent.sessionId;
        }

        if (agentStreamEvent.type === AGENT_STREAM_EVENT_TYPE.DONE) {
          hasDone = true;
        }

        yield agentStreamEvent;
      }

      if (!hasDone && this.abortController?.signal.aborted) {
        yield {
          agentId: this.agentId,
          type: AGENT_STREAM_EVENT_TYPE.ABORTED,
          sessionId: resolvedSessionId ?? "",
        };
      }
    } catch (error) {
      log.error({ agentId: this.agentId, error }, "Query execution failed");
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      yield {
        agentId: this.agentId,
        type: AGENT_STREAM_EVENT_TYPE.ERROR,
        sessionId: resolvedSessionId ?? "",
        error: errorMessage,
      };
    } finally {
      this.abortController = undefined;
      this.updateAgentStatus(AGENT_STATUS.IDLE, messageSource);
    }
  }

  private updateAgentStatus(status: AgentStatus, messageSource: MessageSource): void {
    if (this.agentStatus === status) {
      return;
    }

    this.agentStatus = status;
    log.info({ agentId: this.agentId, status }, "Agent status changed.");

    this.emit("agentStatusChanged", { agentId: this.agentId, status, messageSource });
  }

  private async buildSystemPrompt(
    agent: AgentConfig,
    sensorContext: SensorContext,
    serverConfigs: CrowMcpServerConfig[],
    agentMd: string | undefined
  ): Promise<string> {
    const circles = this.circleManager.getCirclesForEntity(this.agentId, ENTITY_TYPE.AGENT);
    const agentCircles = circles.length
      ? circles
          .map((circle) => {
            const parts = [` - Circle: ${circle.name} (ID: ${circle.id})`];
            if (circle.convention) {
              parts.push(`  Convention: ${circle.convention}`);
            }

            return parts.join("\n");
          })
          .join("\n")
      : undefined;

    const peerAgents = this.registry
      .getPeerAgents(this.agentId)
      .map((peer) => {
        const peerAgentCircles = this.circleManager.getCirclesForEntity(peer.id, ENTITY_TYPE.AGENT);
        const parts = [`Agent ID: ${peer.id}`, `Name: ${peer.name}`];
        if (peer.description) {
          parts.push(`Description: ${peer.description}`);
        }

        if (peerAgentCircles.length) {
          parts.push(`In circles: ${peerAgentCircles.map((circle) => circle.name).join(", ")}`);
        }

        return ` - ${parts.join(", ")}`;
      })
      .join("\n");

    const sensorReadings: string[] = [];
    const sensorIds = agent.sensorIds ?? [];
    for (const sensorId of sensorIds) {
      const sensor = this.sensorManager.getSensor(sensorId);
      if (!sensor) {
        log.warn({ agentId: this.agentId, sensorId }, "Sensor not found.");
        continue;
      }

      try {
        const readings = await sensor.getReading(sensorContext);
        sensorReadings.push(readings);
      } catch (error) {
        log.warn({ agentId: this.agentId, sensorId, sensorName: sensor.name, error }, "Sensor failed to get reading.");
      }
    }

    let fragmentCues: string | undefined;
    if (!isCrowSystemAgent(this.agentId)) {
      try {
        const activeDomainFragmentIds = this.runtimeManager.getActiveDomains(this.agentId);
        fragmentCues = await renderFragmentCues(this.agentId, activeDomainFragmentIds, this.fragmentManager);
      } catch (error) {
        log.warn({ agentId: this.agentId, error }, "Failed to render fragment cues.");
      }
    }

    const gmailServerProfiles = serverConfigs.find(
      (server) => server.name === GMAIL_MCP_SERVER_NAME
    )?.connectionProfiles;
    const hasFeedMcp = serverConfigs.find((server) => server.name === FEED_MCP_SERVER_NAME) ? "true" : undefined;
    const hasFragmentTools = serverConfigs.find((server) => server.name === FRAGMENTS_MCP_SERVER_NAME)
      ? "true"
      : undefined;
    const systemPromptTemplate = this.selectSystemPromptTemplate();
    const content = createMessageContentFromTemplate(
      systemPromptTemplate,
      getDefaultPromptContext(
        {
          agentId: agent.id,
          agentName: agent.name,
          agentEmail: gmailServerProfiles && gmailServerProfiles[CONNECTOR_ID.GOOGLE]?.username,
          persona: agent.persona || undefined,
          agentCircles,
          peerAgents: peerAgents || undefined,
          hasFeedMcp,
          agentMd: agentMd || undefined,
          sensorReadings: sensorReadings.join("\n"),
          hasFragmentTools,
          fragmentCues,
        },
        sensorContext?.timezone
      )
    );

    return content;
  }

  private selectSystemPromptTemplate(): MessageTemplate {
    switch (this.agentId) {
      case CROW_NARRATIVE_ARCHITECT_AGENT_ID:
        return NARRATIVE_ARCHITECT_SYSTEM_PROMPT;
      case CROW_WORLD_BUILDER_AGENT_ID:
        return WORLD_BUILDER_SYSTEM_PROMPT;
      default:
        return isCrowSystemAgent(this.agentId) ? CROW_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT;
    }
  }

  private buildInstructionReminder(
    agent: AgentConfig,
    agentMd: string | undefined,
    reminder: PendingInstructionReminder | undefined
  ): string | undefined {
    if (!reminder?.persona && !reminder?.agentMd) {
      return undefined;
    }

    const sections: string[] = [INSTRUCTION_REMINDER_INTRO];
    if (reminder.persona) {
      sections.push("", "## Persona (updated)", "", agent.persona?.trim() || INSTRUCTION_REMINDER_PERSONA_CLEARED);
    }

    if (reminder.agentMd) {
      sections.push("", "## AGENT.md (updated)", "", agentMd?.trim() || INSTRUCTION_REMINDER_AGENT_MD_CLEARED);
    }

    return sections.join("\n");
  }
}
