import { Client, ChannelTypes, type Message, type AnyTextableChannel, type Uncached } from "oceanic.js";
import type { AgentConfig, DiscordConfig } from "@crow-central-agency/shared";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";
import { MESSAGE_SOURCE_TYPE } from "../../services/message-queue-manager.types.js";
import { splitMessage } from "./discord-message-splitter.js";
import { logger } from "../../utils/logger.js";
import type { ActiveDiscordBot } from "./discord-bot-manager.types.js";

const log = logger.child({ context: "discord-bot-manager" });

/**
 * Manages per-agent Discord bot instances.
 * Each agent with a `discordConfig` gets its own Client.
 */
export class DiscordBotManager {
  private bots = new Map<string, ActiveDiscordBot>();

  constructor(
    private readonly registry: AgentRegistry,
    private readonly runtimeManager: AgentRuntimeManager
  ) {}

  /**
   * Scan all agents and create bots for those with discordConfig.
   * Subscribe to registry events for ongoing sync.
   */
  public async initialize(): Promise<void> {
    this.registry.on("agentCreated", ({ agent }) => this.syncBot(agent));
    this.registry.on("agentUpdated", ({ agent }) => this.syncBot(agent));
    this.registry.on("agentDeleted", ({ agentId }) => this.destroyBot(agentId));

    const agents = this.registry.getAllAgents(true);
    for (const agent of agents) {
      await this.syncBot(agent);
    }

    log.info({ activeBots: this.bots.size }, "Discord bot manager initialized");
  }

  /**
   * Send a message to a Discord channel via the agent's bot.
   * Splits long messages to respect Discord's 2000-char limit.
   */
  public async sendToChannel(agentId: string, channelId: string, text: string): Promise<void> {
    const bot = this.bots.get(agentId);
    if (!bot) {
      log.warn({ agentId, channelId }, "No Discord bot for agent, cannot send message");

      return;
    }

    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      await bot.client.rest.channels.createMessage(channelId, { content: chunk });
    }
  }

  /** Destroy all bots and clean up */
  public async destroy(): Promise<void> {
    const agentIds = [...this.bots.keys()];
    for (const agentId of agentIds) {
      await this.destroyBot(agentId);
    }

    log.info("Discord bot manager destroyed");
  }

  private async trySetUsername(client: Client, desiredName: string): Promise<void> {
    try {
      // client.user may throw
      if (client.user.username === desiredName) {
        return;
      }

      await client.rest.users.editSelf({ username: desiredName });
      log.info({ currentName: client.user.username, desiredName }, "Discord bot username updated");
    } catch (error) {
      // Rate-limited or other Discord API error — non-critical
      log.debug({ desiredName, error }, "Could not update Discord bot username");
    }
  }

  /**
   * Sync a bot instance with the agent's current config.
   * Creates, recreates, updates, or destroys the bot as needed.
   */
  private async syncBot(agent: AgentConfig): Promise<void> {
    const existing = this.bots.get(agent.id);
    const config = agent.discordConfig;

    try {
      // No Discord config, disabled, or no token → destroy existing bot if any
      if (!config || !config.enabled || !config.botToken) {
        if (existing) {
          await this.destroyBot(agent.id);
        }

        return;
      }

      // Bot exists with same token → update config reference in-place
      if (existing && existing.config.botToken === config.botToken) {
        existing.config = config;

        // Sync bot username if agent name changed and sync is enabled
        if (config.syncBotName) {
          await this.trySetUsername(existing.client, agent.name);
        }

        return;
      }

      // Bot exists with different token → destroy and recreate
      if (existing) {
        await this.destroyBot(agent.id);
      }

      // Create new bot
      await this.createBot(agent.id, config);
    } catch (error) {
      log.error({ agentId: agent.id, agentName: agent.name, error }, "Error syncing bot");
    }
  }

  /** Create a Discord Client for an agent and register event handlers */
  private async createBot(agentId: string, config: DiscordConfig): Promise<void> {
    const agentName = this.registry.getAgentName(agentId);
    const client = new Client({
      auth: `Bot ${config.botToken}`,
      gateway: {
        intents: ["GUILDS", "GUILD_MESSAGES", "MESSAGE_CONTENT", "DIRECT_MESSAGES"],
      },
    });

    client.on("ready", () => this.onClientReady(client, agentId, agentName, config));
    client.on("messageCreate", (message) => this.onMessageCreate(agentId, message));
    client.on("error", (error) => {
      log.error({ agentId, agentName, error }, "Discord client error");
    });

    try {
      await client.connect();
      this.bots.set(agentId, { client, config });
    } catch (error) {
      log.error({ agentId, agentName, error }, "Failed to connect Discord bot");
    }
  }

  private async onClientReady(
    client: Client,
    agentId: string,
    agentName: string,
    discordConfig: DiscordConfig
  ): Promise<void> {
    const channelCount = discordConfig.channelIds?.length ?? 0;
    log.info(
      { agentId, agentName, botUser: client.user.tag, channelCount, dmOnly: channelCount === 0 },
      "Discord bot ready"
    );

    if (discordConfig.syncBotName) {
      await this.trySetUsername(client, agentName);
    }
  }

  private async onMessageCreate(agentId: string, message: Message<AnyTextableChannel | Uncached>): Promise<void> {
    // Ignore bots (including self)
    if (message.author.bot) {
      return;
    }

    const bot = this.bots.get(agentId);
    if (!bot) {
      return;
    }

    const { config } = bot;

    // Check allowed user IDs
    if (config.allowedUserIds && config.allowedUserIds.length > 0) {
      if (!config.allowedUserIds.includes(message.author.id)) {
        return;
      }
    }

    const isDm = message.channel?.type === ChannelTypes.DM || message.guildID === null;
    if (!isDm) {
      // Guild channel — check if this channel is configured
      if (!config.channelIds || !config.channelIds.includes(message.channelID)) {
        return;
      }

      // Check mentions-only mode for guild channels
      if (config.respondToMentionsOnly) {
        const isMentioned = message.mentions.users.some((user) => user.id === bot.client.user.id);
        if (!isMentioned) {
          return;
        }
      }
    }

    // Strip bot mention from content
    let content = message.content;
    content = content.replace(new RegExp(`<@!?${bot.client.user.id}>`, "g"), "").trim();
    if (!content) {
      return;
    }

    // Format prompt with context
    const channelName = isDm
      ? undefined
      : message.channel && "name" in message.channel
        ? message.channel.name
        : undefined;
    const contextSuffix = channelName ? ` in #${channelName}` : "";
    const displayName = message.author.globalName ?? message.author.username;
    const prompt = `[Discord message from ${displayName}${contextSuffix}]\n\n${content}`;

    // Show typing indicator (best-effort)
    try {
      await bot.client.rest.channels.sendTyping(message.channelID);
    } catch {
      // Typing failures are non-critical
    }

    // Forward to agent
    await this.runtimeManager.sendMessage(agentId, prompt, {
      sourceType: MESSAGE_SOURCE_TYPE.DISCORD,
      channelId: message.channelID,
      discordUserId: message.author.id,
      discordUsername: message.author.username,
      isDm,
    });
  }

  /** Destroy a bot instance and remove from the map */
  private async destroyBot(agentId: string): Promise<void> {
    const bot = this.bots.get(agentId);
    if (!bot) {
      return;
    }

    this.bots.delete(agentId);
    bot.client.disconnect(false);
    log.info({ agentId }, "Discord bot destroyed");
  }
}
