import type { McpServerConfig, InferShape } from "@anthropic-ai/claude-agent-sdk";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/client";
import type { ZodRawShape } from "zod";
import type { ConnectorProfile } from "../connectors/connector-manager.types.js";

export type McpServerFactory = (agentId: string) => McpServerConfig;
export type McpServerConnectionsFunc = (agentId: string) => Promise<boolean>;
export type McpServerConnectionProfilesFunc = (
  agentId: string
) => Promise<Record<string, ConnectorProfile> | undefined>;

export interface McpServerDefinition {
  displayName?: string;
  isConfigurable?: boolean;
  serverFactory: McpServerFactory;
  hasRequiredConnections?: McpServerConnectionsFunc;
  getConnectionProfiles?: McpServerConnectionProfilesFunc;
}

export interface McpServerRegistration {
  name: string;
  displayName?: string;
  isConfigurable?: boolean;
  /** When set, the server is only available to these agent IDs */
  allowedAgentIds?: Set<string>;
  factory: McpServerFactory;
  hasRequiredConnections?: McpServerConnectionsFunc;
  getConnectionProfiles?: McpServerConnectionProfilesFunc;
}

/** Optional registration metadata accepted by {@link CrowMcpManager.registerMcpServer}. */
export interface RegisterMcpServerOptions {
  displayName?: string;
  isConfigurable?: boolean;
  /** When set, the server is only available to these agent IDs */
  allowedAgentIds?: string[];
  hasRequiredConnections?: McpServerConnectionsFunc;
  getConnectionProfiles?: McpServerConnectionProfilesFunc;
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

export interface CrowMcpServerConfig {
  name: string;
  serverFactory: McpServerFactory;
  isInternal: boolean;
  connectionProfiles?: Record<string, ConnectorProfile>;
}
