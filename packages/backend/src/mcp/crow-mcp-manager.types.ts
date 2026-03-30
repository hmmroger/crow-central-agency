import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";

export type McpServerFactory = (agentId: string) => McpSdkServerConfigWithInstance;
