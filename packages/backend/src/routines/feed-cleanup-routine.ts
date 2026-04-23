import type { Routine } from "./routine-manager.types.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { SystemSettingsManager } from "../services/system-settings-manager.js";
import { logger } from "../utils/logger.js";

const ROUTINE_ID = "feed-cleanup";

const log = logger.child({ context: "feed-cleanup-routine" });

/**
 * Removes dangling references to a deleted feed from all places
 * that track feed subscriptions: agent configs and super crow settings.
 */
class FeedCleanupRoutine {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly systemSettingsManager: SystemSettingsManager
  ) {}

  public createRoutine(): Routine {
    return {
      id: ROUTINE_ID,
      priority: 50,
      onFeedRemoved: this.onFeedRemoved.bind(this),
    };
  }

  private async onFeedRemoved(feedId: string): Promise<void> {
    await this.pruneFromAgents(feedId);
    await this.pruneFromSuperCrowSettings(feedId);
  }

  private async pruneFromAgents(feedId: string): Promise<void> {
    const agents = this.registry.getAllAgents(true);
    for (const agent of agents) {
      if (!agent.configuredFeeds?.some((entry) => entry.feedId === feedId)) {
        continue;
      }

      const nextConfiguredFeeds = agent.configuredFeeds.filter((entry) => entry.feedId !== feedId);
      try {
        await this.registry.updateAgent(agent.id, { configuredFeeds: nextConfiguredFeeds });
      } catch (error) {
        log.error({ agentId: agent.id, feedId, error }, "Failed to prune feedId from agent");
      }
    }
  }

  private async pruneFromSuperCrowSettings(feedId: string): Promise<void> {
    try {
      const current = await this.systemSettingsManager.getSuperCrowSettings();
      if (!current.configuredFeeds.some((entry) => entry.feedId === feedId)) {
        return;
      }

      const nextConfiguredFeeds = current.configuredFeeds.filter((entry) => entry.feedId !== feedId);
      await this.systemSettingsManager.updateSuperCrowSettings({ configuredFeeds: nextConfiguredFeeds });
    } catch (error) {
      log.error({ feedId, error }, "Failed to prune feedId from super crow settings");
    }
  }
}

export function createFeedCleanupRoutine(
  registry: AgentRegistry,
  systemSettingsManager: SystemSettingsManager
): Routine {
  const instance = new FeedCleanupRoutine(registry, systemSettingsManager);
  return instance.createRoutine();
}
