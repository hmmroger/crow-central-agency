import type { AgentConfig } from "@crow-central-agency/shared";

/** Placeholder value used to replace the real bot token in external responses */
export const REDACTED_BOT_TOKEN = "••••••••";

// DO NOT use this except in agent routes or broadcast to WS
export function sanitizeAgentConfig(agent: AgentConfig): AgentConfig {
  if (!agent.discordConfig) {
    return agent;
  }

  const { botToken: _botToken, ...safeDiscordConfig } = agent.discordConfig;

  return {
    ...agent,
    discordConfig: { ...safeDiscordConfig, botToken: REDACTED_BOT_TOKEN },
  };
}

// DO NOT use this except in agent routes or broadcast to WS
export function sanitizeAgentConfigs(agents: AgentConfig[]): AgentConfig[] {
  return agents.map(sanitizeAgentConfig);
}
