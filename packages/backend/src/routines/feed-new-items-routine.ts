import { AGENT_TASK_SOURCE_TYPE, CROW_SYSTEM_AGENT_ID } from "@crow-central-agency/shared";
import type { Routine } from "./routine-manager.types.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { AgentTaskManager } from "../services/agent-task-manager.js";
import type { SystemSettingsManager } from "../services/system-settings-manager.js";
import type { Feed, FeedItem } from "../feed/simply-feed.types.js";
import { logger } from "../utils/logger.js";

const ROUTINE_ID = "feed-new-items";
/** Cap on how many item titles are inlined in the notification prompt. */
const MAX_ITEMS_IN_PROMPT = 20;

const log = logger.child({ context: "feed-new-items-routine" });

function sanitizeForSingleLine(value: string): string {
  return value.replace(/[\r\n\u2028\u2029]+/g, " ").trim();
}

/**
 * Notifies agents when their subscribed feeds receive new items. An agent is
 * notified when its configuredFeeds entry for the feed has isNotify set. Super
 * Crow is notified via its own system-settings configuredFeeds list.
 */
class FeedNewItemsRoutine {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly taskManager: AgentTaskManager,
    private readonly systemSettingsManager: SystemSettingsManager
  ) {}

  public createRoutine(): Routine {
    return {
      id: ROUTINE_ID,
      priority: 50,
      onNewFeedItems: (feed, items) => this.onNewFeedItems(feed, items),
    };
  }

  private async onNewFeedItems(feed: Feed, items: FeedItem[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const agentIds = this.findAgentsToNotify(feed.id);
    if (await this.shouldNotifySuperCrow(feed.id)) {
      agentIds.push(CROW_SYSTEM_AGENT_ID);
    }

    if (agentIds.length === 0) {
      return;
    }

    const prompt = this.buildPrompt(feed, items);
    for (const agentId of agentIds) {
      await this.notifyAgent(agentId, prompt);
    }
  }

  private findAgentsToNotify(feedId: string): string[] {
    return this.registry
      .getAllAgents(true)
      .filter((agent) => agent.configuredFeeds?.some((entry) => entry.feedId === feedId && entry.isNotify === true))
      .map((agent) => agent.id);
  }

  private async shouldNotifySuperCrow(feedId: string): Promise<boolean> {
    try {
      const settings = await this.systemSettingsManager.getSuperCrowSettings();
      return settings.configuredFeeds.some((entry) => entry.feedId === feedId && entry.isNotify === true);
    } catch (error) {
      log.error({ feedId, error }, "Failed to read super crow settings for notification");
      return false;
    }
  }

  private buildPrompt(feed: Feed, items: FeedItem[]): string {
    // Feed and item titles come from third-party RSS/Atom payloads; collapse
    // any embedded line breaks so a malformed title cannot inject fake list
    // entries into the prompt the agent receives.
    const feedTitle = sanitizeForSingleLine(feed.title);
    const lines: string[] = [`New items arrived for feed "${feedTitle}" (feedId: ${feed.id}, count: ${items.length}):`];
    const displayed = items.slice(0, MAX_ITEMS_IN_PROMPT);
    for (const item of displayed) {
      lines.push(`- ${sanitizeForSingleLine(item.title)} (itemId: ${item.id})`);
    }

    if (items.length > displayed.length) {
      lines.push(`... and ${items.length - displayed.length} more.`);
    }

    return lines.join("\n");
  }

  private async notifyAgent(agentId: string, prompt: string): Promise<void> {
    const systemSource = { sourceType: AGENT_TASK_SOURCE_TYPE.SYSTEM };
    const agentOwner = { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId };
    try {
      const task = await this.taskManager.addTask(prompt, systemSource, agentOwner);
      log.debug({ agentId, taskId: task.id }, "Feed new-items task created and assigned");
    } catch (error) {
      log.error({ agentId, error }, "Failed to create feed new-items task");
    }
  }
}

export function createFeedNewItemsRoutine(
  registry: AgentRegistry,
  taskManager: AgentTaskManager,
  systemSettingsManager: SystemSettingsManager
): Routine {
  const instance = new FeedNewItemsRoutine(registry, taskManager, systemSettingsManager);
  return instance.createRoutine();
}
