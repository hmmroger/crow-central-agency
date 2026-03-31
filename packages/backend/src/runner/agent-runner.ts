import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import type {
  CanUseTool,
  McpSdkServerConfigWithInstance,
  HookEvent,
  HookCallbackMatcher,
  SyncHookJSONOutput,
  HookInput,
  Query,
} from "@anthropic-ai/claude-agent-sdk";
import { AGENT_STATUS, CROW_SYSTEM_AGENT_ID, type AgentConfig, type AgentStatus } from "@crow-central-agency/shared";
import { EventBus } from "../event-bus/event-bus.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import { processStream } from "./stream-processor.js";
import { parseToolActivity } from "./tool-activity-parser.js";
import { AppError } from "../error/app-error.js";
import { APP_ERROR_CODES } from "../error/app-error.types.js";
import { env } from "../config/env.js";
import { DEFAULT_PERMISSION_DENY_MESSAGE } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import type { MessageTemplate } from "../utils/message-template.types.js";
import { createMessageContentFromTemplate, getDefaultPromptContext } from "../utils/message-template.js";
import { MessageRoles } from "../model-providers/openai-provider.types.js";
import { AGENTS_MCP_INVOKE_AGENT_TOOL_NAME } from "../mcp/agents-mcp-server.js";
import {
  AGENT_STREAM_EVENT_TYPE,
  type AgentRunnerEvents,
  type AgentStreamEvent,
  type BroadcastActivityCallback,
  type PermissionRequestCallback,
} from "./agent-runner.types.js";
import type { CrowMcpManager } from "../mcp/crow-mcp-manager.js";

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
        "The current date is {currentDate}",
        "The current time is {currentTime}.",
      ],
    },
    {
      content: [
        `The following agents are available for collaboration with the "${AGENTS_MCP_INVOKE_AGENT_TOOL_NAME}" tool from the crow-agents MCP server:`,
        "{peerAgents}",
        `If a task does not fall explicitly within your own scope, check whether a peer agent is better suited and use the "${AGENTS_MCP_INVOKE_AGENT_TOOL_NAME}" tool from the crow-agents MCP server to delegate.`,
        "Do NOT attempt to perform tasks that fall under another agent's responsibility - invoke that agent instead.",
      ],
      keys: ["peerAgents"],
    },
    {
      content: ["## AGENT.md", "", "{agentMd}"],
      keys: ["agentMd"],
    },
  ],
  keys: ["currentDate", "currentTime", "agentId", "agentName", "persona", "peerAgents", "agentMd"],
};

const CROW_SYSTEM_PROMPT: MessageTemplate = {
  role: MessageRoles.system,
  content: [
    { content: ["# Your identity", "", "Your agent ID is: {agentId}", "Your agent name is: {agentName}", ""] },
    { content: ["## Core persona", "", "{persona}", ""], keys: ["persona"] },
    {
      content: ["## Agent Context", "", "The current date is {currentDate}", "The current time is {currentTime}."],
    },
    {
      content: [
        `The following agents are available for task delegation with the "${AGENTS_MCP_INVOKE_AGENT_TOOL_NAME}" tool from the crow-agents MCP server:`,
        "{peerAgents}",
      ],
      keys: ["peerAgents"],
    },
  ],
  keys: ["currentDate", "currentTime", "agentId", "agentName", "persona", "peerAgents"],
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
    private readonly permissionRequestHandler: PermissionRequestCallback,
    private readonly broadcastActivity: BroadcastActivityCallback
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
  public async *sendMessage(message: string, sessionId?: string): AsyncGenerator<AgentStreamEvent, void, unknown> {
    const agentConfig = this.registry.getAgent(this.agentId);
    let nextMessage: string | undefined = message;
    while (nextMessage) {
      const agentStream = await this.runQuery(nextMessage, agentConfig, sessionId);
      for await (const agentStreamEvent of agentStream) {
        log.debug({ agentId: this.agentId, agentStreamEvent: agentStreamEvent.type }, "Agent stream event");
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
    agentConfig: AgentConfig,
    sessionId?: string
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    // Track running agent
    this.abortController = new AbortController();

    const systemPrompt = await this.buildSystemPrompt(agentConfig);
    const systemPromptOption = systemPrompt
      ? agentConfig.isReplaceSystemPrompt
        ? systemPrompt
        : { type: "preset" as const, preset: "claude_code" as const, append: systemPrompt }
      : undefined;

    // Build SDK options
    const toolsOption = agentConfig.toolConfig.mode === "restricted" ? agentConfig.toolConfig.tools : undefined;
    const internalMcpPrefixes = this.mcpManager.getMcpPrefixes();

    // Create query (mcpServers cast will be properly typed when MCP servers are implemented in Phase 5)
    const queryInstance = sdkQuery({
      prompt: message,
      options: {
        cwd: agentConfig.workspace,
        model: agentConfig.model,
        resume: sessionId,
        systemPrompt: systemPromptOption,
        abortController: this.abortController,
        includePartialMessages: true,
        permissionMode: agentConfig.permissionMode,
        allowedTools: [
          ...(agentConfig.toolConfig.autoApprovedTools || []),
          ...internalMcpPrefixes.map((prefix) => `${prefix}*`),
        ],
        tools: toolsOption,
        canUseTool: this.buildCanUseTool(),
        settingSources: agentConfig.settingSources,
        mcpServers: this.buildMcpServers(),
        persistSession: true,
        agentProgressSummaries: true,
        pathToClaudeCodeExecutable: env.CLAUDE_CLI_PATH,
        toolConfig: {
          askUserQuestion: { previewFormat: "html" },
        },
        hooks: this.buildSdkHooks(this.broadcastActivity),
      },
    });

    this.query = queryInstance;
    this.updateAgentStatus(AGENT_STATUS.STREAMING);

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
          type: AGENT_STREAM_EVENT_TYPE.ABORTED,
          sessionId: sessionId ?? "",
        };
      }
    } catch (error) {
      log.error({ agentId: this.agentId, error }, "Query execution failed");
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      yield {
        type: AGENT_STREAM_EVENT_TYPE.ERROR,
        sessionId: sessionId ?? "",
        error: errorMessage,
      };
    } finally {
      this.query = undefined;
      this.abortController = undefined;
      this.updateAgentStatus(AGENT_STATUS.IDLE);
    }
  }

  private updateAgentStatus(status: AgentStatus): void {
    if (this.agentStatus === status) {
      return;
    }

    this.agentStatus = status;
    log.info({ agentId: this.agentId, status }, "Agent status changed.");

    this.emit("agentStatusChanged", { agentId: this.agentId, status });
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

  /** Build MCP servers for a query using registered factories */
  private buildMcpServers(): Record<string, McpSdkServerConfigWithInstance> {
    const servers: Record<string, McpSdkServerConfigWithInstance> = {};
    for (const { name, serverFactory } of this.mcpManager.getAllMcpServer()) {
      servers[name] = serverFactory(this.agentId);
    }

    return servers;
  }

  private buildSdkHooks(
    broadcastActivity: BroadcastActivityCallback
  ): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
    const systemToolUseHookHandler = this.getSystemToolUseHookHandler(broadcastActivity);

    return {
      SubagentStart: [
        {
          hooks: [
            async (input) => {
              try {
                if (input.hook_event_name === "SubagentStart") {
                  broadcastActivity("Agent", `Subagent started: ${input.agent_type}`);
                }
              } catch (error) {
                log.warn({ agentId: this.agentId, error }, "SubagentStart hook broadcast failed");
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
                  broadcastActivity("Agent", `Subagent completed: ${input.agent_type}`);
                }
              } catch (error) {
                log.warn({ agentId: this.agentId, error }, "SubagentStop hook broadcast failed");
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
    broadcastActivity: BroadcastActivityCallback
  ): (input: HookInput) => Promise<SyncHookJSONOutput> {
    return async (input) => {
      try {
        // Only broadcast for subagent tool use (has agent_id on the input)
        if (input.hook_event_name === "PreToolUse" && input.agent_id) {
          const description = parseToolActivity(input.tool_name, input.tool_input);
          broadcastActivity(input.tool_name, `Subagent: ${description}`);
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

  private async buildSystemPrompt(agent: AgentConfig): Promise<string> {
    const agentMd = await this.registry.getAgentMd(this.agentId);
    const peerAgents = this.registry
      .getAllAgents()
      .filter((peer) => peer.id !== this.agentId)
      .map((peer) => {
        const parts = [`Agent ID: ${peer.id}`, `Name: ${peer.name}`];
        if (peer.description) {
          parts.push(`Description: ${peer.description}`);
        }

        return `- ${parts.join(", ")}`;
      })
      .join("\n");

    const content = createMessageContentFromTemplate(
      this.agentId === CROW_SYSTEM_AGENT_ID ? CROW_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT,
      getDefaultPromptContext({
        agentId: agent.id,
        agentName: agent.name,
        persona: agent.persona || undefined,
        peerAgents: peerAgents || undefined,
        agentMd: agentMd || undefined,
      })
    );

    return content;
  }
}
