import type { Routine } from "./routine-manager.types.js";
import type { DiscordBotManager } from "../bot-connectors/discord/discord-bot-manager.js";
import type { AgentRuntimeManager } from "../services/runtime/agent-runtime-manager.js";
import { MESSAGE_SOURCE_TYPE, type MessageSource } from "../services/message-queue-manager.types.js";
import { logger } from "../utils/logger.js";
import type { ArtifactRecord } from "../services/runtime/agent-runtime-manager.types.js";

const ROUTINE_ID = "discord";
const DISCORD_ERROR_RESPONSE = "I encountered an issue processing your message.";

const log = logger.child({ context: "discord-routine" });

/**
 * Routes agent responses back to Discord.
 * When the message source is DISCORD, uses the source channel directly.
 * For other sources, falls back to the persisted discordDmChannelId on
 * the agent's runtime state.
 */
class DiscordRoutine {
  constructor(
    private readonly discordBotManager: DiscordBotManager,
    private readonly runtimeManager: AgentRuntimeManager
  ) {}

  public createRoutine(): Routine {
    return {
      id: ROUTINE_ID,
      priority: 5,
      onMessageDone: this.onMessageDone.bind(this),
    };
  }

  private async onMessageDone(
    agentId: string,
    source: MessageSource,
    lastAssistantMessage?: string,
    _artifactsWritten?: ArtifactRecord[],
    isAbortedOrError?: boolean
  ): Promise<void> {
    const channelId =
      source.sourceType === MESSAGE_SOURCE_TYPE.DISCORD
        ? source.channelId
        : this.runtimeManager.getState(agentId)?.discordDmChannelId;

    if (!channelId) {
      return;
    }

    const responseText = isAbortedOrError ? DISCORD_ERROR_RESPONSE : lastAssistantMessage;
    if (!responseText) {
      return;
    }

    try {
      await this.discordBotManager.sendToChannel(agentId, channelId, responseText);
    } catch (error) {
      log.error({ agentId, channelId, error }, "Failed to send Discord response");
    }
  }
}

export function createDiscordRoutine(
  discordBotManager: DiscordBotManager,
  runtimeManager: AgentRuntimeManager
): Routine {
  const instance = new DiscordRoutine(discordBotManager, runtimeManager);

  return instance.createRoutine();
}
