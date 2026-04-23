import type { Client } from "oceanic.js";
import type { DiscordConfig } from "@crow-central-agency/shared";

/** A live Discord bot instance bound to a specific agent */
export interface ActiveDiscordBot {
  client: Client;
  config: DiscordConfig;
}
