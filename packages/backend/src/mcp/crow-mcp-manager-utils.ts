import type { ZodRawShape } from "zod";
import type { McpToolConfig, RegisteredMcpTool } from "./crow-mcp-manager.types.js";

/** The prefix every tool of an internal MCP server is named with, for every provider */
export function toInternalMcpToolPrefix(serverName: string): string {
  return `mcp__${serverName}__`;
}

/** The full name an internal MCP tool is called and permission-matched by */
export function toInternalMcpToolName(serverName: string, toolName: string): string {
  return `${toInternalMcpToolPrefix(serverName)}${toolName}`;
}

export function defineMcpTool<InputArgs extends ZodRawShape>(config: McpToolConfig<InputArgs>): RegisteredMcpTool {
  return {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    annotations: config.annotations,
    handler: config.handler as RegisteredMcpTool["handler"],
  };
}
