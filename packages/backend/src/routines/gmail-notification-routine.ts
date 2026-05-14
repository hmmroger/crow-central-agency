import { AGENT_TASK_SOURCE_TYPE, type AgentConfig } from "@crow-central-agency/shared";
import type { Routine } from "./routine-manager.types.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { AgentTaskManager } from "../services/agent-task-manager.js";
import type { AgentRuntimeManager } from "../services/runtime/agent-runtime-manager.js";
import type { ConnectorManager } from "../connectors/connector-manager.js";
import type { SensorManager } from "../sensors/sensor-manager.js";
import { GoogleClient } from "../services/google/google-client.js";
import { GMAIL_MCP_SERVER_NAME } from "../mcp/gmail/gmail-mcp-server.js";
import { formatLocalIsoDateTime } from "../utils/date-utils.js";
import { logger } from "../utils/logger.js";
import type { ListGmailMessagesResult } from "../services/google/google-client.types.js";
import { env } from "../config/env.js";

const ROUTINE_ID = "gmail-notification";
const MAX_NEW_MAILS_IN_PROMPT = 20;
const DEFAULT_CHECK_INTERVAL_IN_MINUTES = 15;

const log = logger.child({ context: "gmail-notification-routine" });

class GmailNotificationRoutine {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly taskManager: AgentTaskManager,
    private readonly runtimeManager: AgentRuntimeManager,
    private readonly connectorManager: ConnectorManager,
    private readonly sensorManager: SensorManager
  ) {}

  public createRoutine(): Routine {
    return {
      id: ROUTINE_ID,
      priority: 50,
      intervalInMinutes: env.GMAIL_CHECK_INTERVAL_IN_MINUTES ?? DEFAULT_CHECK_INTERVAL_IN_MINUTES,
      onAgentUpdated: (agentConfig, previousAgent) => this.onAgentUpdated(agentConfig, previousAgent),
      onInterval: () => this.onInterval(),
    };
  }

  private async onInterval(): Promise<void> {
    const eligibleAgents = this.registry
      .getAllAgents()
      .filter((agent) => agent.enableGmailNotification && agent.mcpServerIds?.includes(GMAIL_MCP_SERVER_NAME));

    for (const agent of eligibleAgents) {
      try {
        await this.checkAgentGmail(agent);
      } catch (error) {
        log.error({ agentId: agent.id, error }, "Failed to check Gmail for agent");
      }
    }
  }

  private async checkAgentGmail(agent: AgentConfig): Promise<void> {
    const state = this.runtimeManager.getState(agent.id);
    const currentCheckTimestamp = Date.now();
    const lastCheckTimestamp = state?.lastGmailCheckTimestamp;

    // First-time check: seed the baseline so future ticks only see new mail.
    if (lastCheckTimestamp === undefined) {
      await this.runtimeManager.setLastGmailCheckTimestamp(agent.id, currentCheckTimestamp);
      return;
    }

    const userTimezone = await this.sensorManager.getUserTimezone();
    const afterDateTime = formatLocalIsoDateTime(lastCheckTimestamp, userTimezone);
    const client = new GoogleClient(this.connectorManager, this.sensorManager, agent.id);
    const result = await client.listGmailMessages({ afterDateTime, limit: MAX_NEW_MAILS_IN_PROMPT + 1 });

    if (result.messages.length > 0) {
      log.info({ agentId: agent.id, count: result.messages.length }, "New Gmail messages found for agent");
      const prompt = this.buildPrompt(result);
      await this.notifyAgent(agent.id, prompt);
    }

    await this.runtimeManager.setLastGmailCheckTimestamp(agent.id, currentCheckTimestamp);
  }

  private async onAgentUpdated(agentConfig: AgentConfig, previousAgent: AgentConfig): Promise<void> {
    if (agentConfig.enableGmailNotification && !previousAgent.enableGmailNotification) {
      await this.runtimeManager.setLastGmailCheckTimestamp(agentConfig.id, Date.now());
    }
  }

  private buildPrompt(messagesResult: ListGmailMessagesResult): string {
    const hasMore = messagesResult.messages.length > MAX_NEW_MAILS_IN_PROMPT;
    const displayMessages = messagesResult.messages.slice(0, MAX_NEW_MAILS_IN_PROMPT);
    const lines: string[] = [`New mails arrived:`];
    for (const message of displayMessages) {
      const from = message.from ?? "Unknown sender";
      const subject = message.subject ?? "No subject";
      const date = message.date ?? "Unknown date";
      lines.push(`- [${date}] From ${from}: ${subject} (message ID: ${message.id})`);
    }

    if (hasMore) {
      lines.push(`... and more new mails available beyond the first ${MAX_NEW_MAILS_IN_PROMPT}.`);
    }

    return lines.join("\n");
  }

  private async notifyAgent(agentId: string, prompt: string): Promise<void> {
    const systemSource = { sourceType: AGENT_TASK_SOURCE_TYPE.SYSTEM };
    const agentOwner = { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId };
    try {
      await this.taskManager.addTask(prompt, systemSource, agentOwner);
    } catch (error) {
      log.error({ agentId, error }, "Failed to create gmail notification task");
    }
  }
}

export function createGmailNotificationRoutine(
  registry: AgentRegistry,
  taskManager: AgentTaskManager,
  runtimeManager: AgentRuntimeManager,
  connectorManager: ConnectorManager,
  sensorManager: SensorManager
): Routine {
  const instance = new GmailNotificationRoutine(registry, taskManager, runtimeManager, connectorManager, sensorManager);
  return instance.createRoutine();
}
