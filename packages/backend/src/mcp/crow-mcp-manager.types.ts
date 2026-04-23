import type { McpServerConfig, InferShape } from "@anthropic-ai/claude-agent-sdk";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/client";
import type { ZodRawShape } from "zod";

export type McpServerFactory = (agentId: string) => McpServerConfig;

export interface McpServerRegistration {
  factory: McpServerFactory;
  /** When set, the server is only available to these agent IDs */
  allowedAgentIds?: Set<string>;
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
