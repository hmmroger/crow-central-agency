/** Last query result info (displayed outside the message list) */
export interface QueryResult {
  subtype: string;
  costUsd?: number;
  durationMs?: number;
}

/** Real-time tool execution state (from agent_activity + agent_tool_progress WS events) */
export interface ActiveToolUse {
  toolName: string;
  description: string;
  elapsedTimeSeconds?: number;
}
