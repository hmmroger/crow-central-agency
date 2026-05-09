import type { McpServerConfig, InferShape } from "@anthropic-ai/claude-agent-sdk";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/client";
import type { ZodRawShape } from "zod";

export type McpServerFactory = (agentId: string) => McpServerConfig;
export type McpServerConnectionsFunc = (agentId: string) => Promise<boolean>;

export interface McpServerDefinition {
  displayName?: string;
  isConfigurable?: boolean;
  serverFactory: McpServerFactory;
  hasRequiredConnections?: McpServerConnectionsFunc;
}

export interface McpServerRegistration {
  name: string;
  displayName?: string;
  isConfigurable?: boolean;
  /** When set, the server is only available to these agent IDs */
  allowedAgentIds?: Set<string>;
  factory: McpServerFactory;
  hasRequiredConnections?: McpServerConnectionsFunc;
}

/** Optional registration metadata accepted by {@link CrowMcpManager.registerMcpServer}. */
export interface RegisterMcpServerOptions {
  displayName?: string;
  isConfigurable?: boolean;
  /** When set, the server is only available to these agent IDs */
  allowedAgentIds?: string[];
  hasRequiredConnections?: McpServerConnectionsFunc;
}

export type ToolHandler<InputArgs extends ZodRawShape> = (
  args: InferShape<InputArgs>,
  extra: unknown
) => Promise<CallToolResult>;

export interface McpToolConfig<InputArgs extends ZodRawShape> {
  name: string;
  description: string;
  inputSchema: InputArgs;
  annotations?: ToolAnnotations;
  handler: ToolHandler<InputArgs>;
}
