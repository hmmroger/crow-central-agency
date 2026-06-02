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
import { resolveModel } from "@crow-central-agency/shared";
import { AgentRunner } from "./agent-runner.js";
import { processStream } from "./stream-processor.js";
import { parseToolActivity } from "./tool-activity-parser.js";
import { env } from "../config/env.js";
import { DEFAULT_PERMISSION_DENY_MESSAGE } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { userMessageForAgent } from "../utils/message-template.js";
import {
  AGENT_STREAM_EVENT_TYPE,
  type AgentRunQueryRequest,
  type AgentStreamEvent,
  type OOBStreamEventCallback,
  type PermissionRequestCallback,
} from "./agent-runner.types.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { CrowMcpManager } from "../mcp/crow-mcp-manager.js";
import type { SensorManager } from "../sensors/sensor-manager.js";
import type { AgentCircleManager } from "../services/agent-circle-manager.js";
import type { CrowMcpServerConfig } from "../mcp/crow-mcp-manager.types.js";

const log = logger.child({ context: "claude-code-agent-runner" });

/**
 * Claude Code agent runner. Translates a provider-agnostic AgentRunQueryRequest into a
 * `@anthropic-ai/claude-agent-sdk` query, drives the SDK stream through the shared stream
 * processor, and delivers injected messages via the PreToolUse hook. The base class owns status,
 * the abort signal, and ABORTED/ERROR synthesis.
 */
export class ClaudeCodeAgentRunner extends AgentRunner {
  private query?: Query;

  constructor(
    agentId: string,
    registry: AgentRegistry,
    mcpManager: CrowMcpManager,
    sensorManager: SensorManager,
    circleManager: AgentCircleManager,
    private readonly permissionRequestHandler: PermissionRequestCallback,
    private readonly oobEventCallback: OOBStreamEventCallback
  ) {
    super(agentId, registry, mcpManager, sensorManager, circleManager);
  }

  protected async *runProviderQuery(request: AgentRunQueryRequest): AsyncGenerator<AgentStreamEvent, void, unknown> {
    const { message, agentConfig, cwd, systemPrompt, timezone, serverConfigs, internalMcpPrefixes, sessionId } =
      request;

    const mcpServers = await this.buildMcpServers(serverConfigs);
    const systemPromptOption = systemPrompt
      ? agentConfig.excludeClaudeCodeSystemPrompt
        ? systemPrompt
        : { type: "preset" as const, preset: "claude_code" as const, append: systemPrompt }
      : undefined;

    const toolsOption =
      agentConfig.toolConfig.mode === "restricted"
        ? agentConfig.toolConfig.tools
        : { type: "preset" as const, preset: "claude_code" as const };
    const persistSession = agentConfig.persistSession === false ? false : true;

    const queryInstance = sdkQuery({
      prompt: userMessageForAgent(new Date(), message, timezone),
      options: {
        cwd,
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
        hooks: this.buildSdkHooks(),
      },
    });

    this.query = queryInstance;
    try {
      for await (const agentStreamEvent of processStream(this.agentId, queryInstance, internalMcpPrefixes)) {
        yield agentStreamEvent;
      }
    } finally {
      this.query = undefined;
    }
  }

  protected cancelProviderQuery(): void {
    this.query?.close();
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
  private async buildMcpServers(serverConfigs: CrowMcpServerConfig[]): Promise<Record<string, McpServerConfig>> {
    const servers: Record<string, McpServerConfig> = {};
    for (const { name, serverFactory } of serverConfigs) {
      servers[name] = serverFactory(this.agentId);
    }

    return servers;
  }

  private buildSdkHooks(): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
    const systemToolUseHookHandler = this.getSystemToolUseHookHandler();

    return {
      SubagentStart: [
        {
          hooks: [
            async (input) => {
              try {
                if (input.hook_event_name === "SubagentStart") {
                  this.oobEventCallback({
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
                  this.oobEventCallback({
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

  private getSystemToolUseHookHandler(): (input: HookInput) => Promise<SyncHookJSONOutput> {
    return async (input) => {
      try {
        if (input.hook_event_name === "PreToolUse") {
          const description = parseToolActivity(input.tool_name, input.tool_input);
          this.oobEventCallback({
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
        const systemMessage = this.drainInjectedMessages();
        if (systemMessage) {
          log.info({ agentId: this.agentId }, "Delivering injected messages via hook");
          return { continue: true, systemMessage };
        }
      }

      return { continue: true };
    };
  }
}
