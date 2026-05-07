import type { McpServerConfig, InferShape } from "@anthropic-ai/claude-agent-sdk";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/client";
import type { ZodRawShape } from "zod";

export type McpServerFactory = (agentId: string) => McpServerConfig;

export interface McpServerRegistration {
  name: string;
  factory: McpServerFactory;
  hasRequiredConnections?: (agentId: string) => Promise<boolean>;
  /** When set, the server is only available to these agent IDs */
  allowedAgentIds?: Set<string>;
  isConfigurable?: boolean;
}

/** Optional registration metadata accepted by {@link CrowMcpManager.registerMcpServer}. */
export interface RegisterMcpServerOptions {
  /** When set, the server is only available to these agent IDs */
  allowedAgentIds?: string[];
  isConfigurable?: boolean;
  hasRequiredConnections?: (agentId: string) => Promise<boolean>;
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
