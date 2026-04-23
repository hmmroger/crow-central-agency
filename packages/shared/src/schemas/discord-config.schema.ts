import { z } from "zod";

/**
 * Discord bot configuration for an agent.
 * When present on an agent config, a discord.js bot is created for that agent.
 * By default (no channelIds), the bot only responds to direct messages.
 */
export const DiscordConfigSchema = z.object({
  /** Whether the Discord bot is active */
  enabled: z.boolean().default(false),
  /** Discord bot token from the Discord Developer Portal */
  botToken: z.string().optional(),
  /** Optional guild channel IDs the bot listens in. If omitted, bot only responds to DMs. */
  channelIds: z.array(z.string().min(1)).optional(),
  /** Optional Discord user IDs allowed to interact. If omitted, any user can interact. */
  allowedUserIds: z.array(z.string().min(1)).optional(),
  /** When true, the bot only responds when @mentioned in guild channels (does not affect DMs). */
  respondToMentionsOnly: z.boolean().default(false),
  /** When true, sync the Discord bot username to match the agent name. */
  syncBotName: z.boolean().default(false),
});

export type DiscordConfig = z.infer<typeof DiscordConfigSchema>;
