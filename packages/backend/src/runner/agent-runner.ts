import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import type {
  CanUseTool,
  HookEvent,
  HookCallbackMatcher,
  SyncHookJSONOutput,
  HookInput,
  Query,
  McpServerConfig,
} from "@anthropic-ai/claude-agent-sdk";
import {
  AGENT_STATUS,
  ENTITY_TYPE,
  resolveModel,
  type AgentConfig,
  type AgentStatus,
} from "@crow-central-agency/shared";
import { EventBus } from "../core/event-bus/event-bus.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import { processStream } from "./stream-processor.js";
import { parseToolActivity } from "./tool-activity-parser.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { env } from "../config/env.js";
import { DEFAULT_PERMISSION_DENY_MESSAGE } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import type { MessageTemplate } from "../utils/message-template.types.js";
import {
  createMessageContentFromTemplate,
  getDefaultPromptContext,
  userMessageForAgent,
} from "../utils/message-template.js";
import { MessageRoles } from "../services/text-generation/text-generation-service.types.js";
import { INVOKE_AGENT_TOOL_NAME } from "../mcp/agents/invoke-agent.js";
import { FEED_MCP_SERVER_NAME } from "../mcp/feed/feed-mcp-server.js";
import {
  AGENT_STREAM_EVENT_TYPE,
  type AgentRunnerEvents,
  type AgentStreamEvent,
  type OOBStreamEventCallback,
  type PermissionRequestCallback,
} from "./agent-runner.types.js";
import type { CrowMcpManager } from "../mcp/crow-mcp-manager.js";
import { isCrowSystemAgent } from "../utils/id-utils.js";
import type { SensorManager } from "../sensors/sensor-manager.js";
import type { SensorContext } from "../sensors/sensor-manager.types.js";
import type { MessageSource } from "../services/message-queue-manager.types.js";
import type { AgentCircleManager } from "../services/agent-circle-manager.js";

const DEFAULT_SYSTEM_PROMPT: MessageTemplate = {
  role: MessageRoles.system,
  content: [
    { content: ["# Your identity", "", "Your agent ID is: {agentId}", "Your agent name is: {agentName}", ""] },
    { content: ["## Core persona", "", "{persona}", ""], keys: ["persona"] },
    {
      content: [
        "## Agent Context",
        "",
        "Avoid speculation and never fabricate data or sources. Be transparent if you do not have enough information.",
        "You have artifact tools for storing and retrieving information that can be referenced later by you or other agents.",
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
    "agentMd",
    "sensorReadings",
  ],
};

const CROW_SYSTEM_PROMPT: MessageTemplate = {
  role: MessageRoles.system,
  content: [
    { content: ["# Your identity", "", "Your agent ID is: {agentId}", "Your agent name is: {agentName}", ""] },
    { content: ["## Core persona", "", "{persona}", ""], keys: ["persona"] },
    {
      content: [
        "## Agent Context",
        "",
        "You have access to `crow-tasks` tools for getting task details by ID, create task, and assign task.",
        "You have artifact tools for storing and retrieving information that can be referenced later by you or other agents.",
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

const log = logger.child({ context: "agent-runner" });

export class AgentRunner extends EventBus<AgentRunnerEvents> {
  private agentStatus: AgentStatus;
  private query?: Query;
  private abortController?: AbortController;
  private injectedMessages?: string[];

  constructor(
    private readonly agentId: string,
    private readonly registry: AgentRegistry,
    private readonly mcpManager: CrowMcpManager,
    private readonly sensorManager: SensorManager,
    private readonly circleManager: AgentCircleManager,
    private readonly permissionRequestHandler: PermissionRequestCallback,
    private readonly oobEventCallback: OOBStreamEventCallback
  ) {
    super();
    this.agentStatus = AGENT_STATUS.IDLE;
  }

  public getAgentStatus(): AgentStatus {
    return this.agentStatus;
  }

  /**
   * Send a message to an agent - creates an SDK query and processes the stream.
   * If the agent is busy, the message is transparently enqueued and processed
   * when the agent becomes idle.
   */
  public async *sendMessage(
    message: string,
    messageSource: MessageSource,
    sessionId?: string
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    const agentConfig = this.registry.getAgent(this.agentId);
    let nextMessage: string | undefined = message;
    while (nextMessage) {
      const agentStream = await this.runQuery(nextMessage, messageSource, agentConfig, sessionId);
      for await (const agentStreamEvent of agentStream) {
        yield agentStreamEvent;
      }

      // Injected messages take priority holding the same promise
      nextMessage = this.getInjectedMessages();
      if (nextMessage) {
        log.info({ agentId: this.agentId }, "Delivering injected messages post query.");
      }
    }
  }

  /**
   * Inject a message into an active agent stream.
   * The message is buffered and delivered as a systemMessage via the PreToolUse hook
   * on the agent's next tool use.
   */
  public injectMessage(text: string): void {
    if (!this.query) {
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
    this.query?.close();
  }

  private async *runQuery(
    message: string,
    messageSource: MessageSource,
    agentConfig: AgentConfig,
    sessionId?: string
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    this.updateAgentStatus(AGENT_STATUS.ACTIVATING, messageSource);
    // Track running agent
    this.abortController = new AbortController();

    const mcpServers = await this.buildMcpServers();
    const hasFeedMcp = mcpServers[FEED_MCP_SERVER_NAME] ? "true" : undefined;
    const sensorContext = await this.sensorManager.getSensorContext();
    const systemPrompt = await this.buildSystemPrompt(agentConfig, sensorContext, hasFeedMcp);
    const systemPromptOption = systemPrompt
      ? agentConfig.excludeClaudeCodeSystemPrompt
        ? systemPrompt
        : { type: "preset" as const, preset: "claude_code" as const, append: systemPrompt }
      : undefined;

    const toolsOption =
      agentConfig.toolConfig.mode === "restricted"
        ? agentConfig.toolConfig.tools
        : { type: "preset" as const, preset: "claude_code" as const };
    const internalMcpPrefixes = await this.mcpManager.getInternalMcpPrefixes(this.agentId);
    const persistSession = agentConfig.persistSession === false ? false : true;

    const queryInstance = sdkQuery({
      prompt: userMessageForAgent(new Date(), message, sensorContext.timezone),
      options: {
        cwd: this.registry.resolveWorkspace(agentConfig),
        model: resolveModel(agentConfig.model),
        resume: persistSession ? sessionId : undefined,
        systemPrompt: systemPromptOption,
        abortController: this.abortController,
        includePartialMessages: true,
        permissionMode: agentConfig.permissionMode,
        allowedTools: [
          ...(agentConfig.toolConfig.autoApprovedTools || []),
          ...internalMcpPrefixes.map((prefix) => `${prefix}*`),
        ],
        tools: toolsOption,
        disallowedTools: agentConfig.toolConfig.disallowedTools,
        canUseTool: this.buildCanUseTool(),
        settingSources: agentConfig.settingSources,
        mcpServers,
        persistSession,
        agentProgressSummaries: true,
        pathToClaudeCodeExecutable: env.CLAUDE_CLI_PATH,
        toolConfig: {
          askUserQuestion: { previewFormat: "html" },
        },
        hooks: this.buildSdkHooks(this.oobEventCallback),
      },
    });

    this.query = queryInstance;
    this.updateAgentStatus(AGENT_STATUS.STREAMING, messageSource);

    try {
      let hasDone = false;
      for await (const agentStreamEvent of processStream(this.agentId, queryInstance, internalMcpPrefixes)) {
        if (!sessionId) {
          sessionId = agentStreamEvent.sessionId;
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
          sessionId: sessionId ?? "",
        };
      }
    } catch (error) {
      log.error({ agentId: this.agentId, error }, "Query execution failed");
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      yield {
        agentId: this.agentId,
        type: AGENT_STREAM_EVENT_TYPE.ERROR,
        sessionId: sessionId ?? "",
        error: errorMessage,
      };
    } finally {
      this.query = undefined;
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

  private buildCanUseTool(): CanUseTool {
    return async (toolName, input, options) => {
      const result = await this.permissionRequestHandler(
        this.agentId,
        toolName,
        input,
        options.toolUseID,
        options.decisionReason
      );

      if (result.behavior === "allow") {
        return { behavior: "allow" as const, updatedInput: result.updatedInput || input, toolUseID: options.toolUseID };
      }

      return {
        behavior: "deny" as const,
        message: result.message ?? DEFAULT_PERMISSION_DENY_MESSAGE,
        toolUseID: options.toolUseID,
      };
    };
  }

  /** Build MCP servers for a query — only includes servers the agent has access to */
  private async buildMcpServers(): Promise<Record<string, McpServerConfig>> {
    const servers: Record<string, McpServerConfig> = {};
    for (const { name, serverFactory } of await this.mcpManager.getMcpServersForAgent(this.agentId)) {
      servers[name] = serverFactory(this.agentId);
    }

    return servers;
  }

  private buildSdkHooks(
    oobStreamEventCallback: OOBStreamEventCallback
  ): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
    const systemToolUseHookHandler = this.getSystemToolUseHookHandler(oobStreamEventCallback);

    return {
      SubagentStart: [
        {
          hooks: [
            async (input) => {
              try {
                if (input.hook_event_name === "SubagentStart") {
                  oobStreamEventCallback({
                    type: AGENT_STREAM_EVENT_TYPE.ACTIVITY,
                    agentId: this.agentId,
                    sessionId: input.session_id,
                    activity: "Agent",
                    description: `Subagent started: ${input.agent_type}`,
                    subAgentId: input.agent_id,
                  });
                }
              } catch (error) {
                log.warn({ agentId: this.agentId, error }, "SubagentStart hook callback event failed");
              }

              return { continue: true };
            },
          ],
        },
      ],
      SubagentStop: [
        {
          hooks: [
            async (input) => {
              try {
                if (input.hook_event_name === "SubagentStop") {
                  oobStreamEventCallback({
                    type: AGENT_STREAM_EVENT_TYPE.ACTIVITY,
                    agentId: this.agentId,
                    sessionId: input.session_id,
                    activity: "Agent",
                    description: `Subagent completed: ${input.agent_type}`,
                    subAgentId: input.agent_id,
                  });
                }
              } catch (error) {
                log.warn({ agentId: this.agentId, error }, "SubagentStop hook callback event failed");
              }

              return { continue: true };
            },
          ],
        },
      ],
      PreToolUse: [
        {
          hooks: [systemToolUseHookHandler],
        },
      ],
      PostToolUse: [
        {
          hooks: [systemToolUseHookHandler],
        },
      ],
    };
  }

  private getSystemToolUseHookHandler(
    oobStreamEventCallback: OOBStreamEventCallback
  ): (input: HookInput) => Promise<SyncHookJSONOutput> {
    return async (input) => {
      try {
        if (input.hook_event_name === "PreToolUse") {
          const description = parseToolActivity(input.tool_name, input.tool_input);
          oobStreamEventCallback({
            type: AGENT_STREAM_EVENT_TYPE.TOOL_USE,
            agentId: this.agentId,
            sessionId: input.session_id,
            toolName: input.tool_name,
            input: input.tool_input,
            description,
            subAgentId: input.agent_id,
          });
        }
      } catch (error) {
        log.warn({ agentId: this.agentId, error }, "PreToolUse hook broadcast failed");
      }

      // Only try to inject on main agent
      if ((input.hook_event_name === "PreToolUse" || input.hook_event_name === "PostToolUse") && !input.agent_id) {
        // Drain any injected messages as a systemMessage
        const systemMessage = this.getInjectedMessages();
        if (systemMessage) {
          log.info({ agentId: this.agentId }, "Delivering injected messages via hook");
          return { continue: true, systemMessage };
        }
      }

      return { continue: true };
    };
  }

  private getInjectedMessages(): string | undefined {
    const injectedMessages = this.injectedMessages;
    if (!injectedMessages?.length) {
      return undefined;
    }

    this.injectedMessages = undefined;
    return injectedMessages.join("\n\n");
  }

  private async buildSystemPrompt(
    agent: AgentConfig,
    sensorContext: SensorContext,
    hasFeedMcp?: string
  ): Promise<string> {
    const agentMd = await this.registry.getAgentMd(this.agentId);
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

    const content = createMessageContentFromTemplate(
      isCrowSystemAgent(this.agentId) ? CROW_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT,
      getDefaultPromptContext(
        {
          agentId: agent.id,
          agentName: agent.name,
          persona: agent.persona || undefined,
          agentCircles,
          peerAgents: peerAgents || undefined,
          hasFeedMcp,
          agentMd: agentMd || undefined,
          sensorReadings: sensorReadings.join("\n"),
        },
        sensorContext?.timezone
      )
    );

    return content;
  }
}
