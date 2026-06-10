import type { ZodRawShape } from "zod";
import type { McpToolConfig, RegisteredMcpTool } from "./crow-mcp-manager.types.js";

export function defineMcpTool<InputArgs extends ZodRawShape>(config: McpToolConfig<InputArgs>): RegisteredMcpTool {
  return {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    annotations: config.annotations,
    handler: config.handler as RegisteredMcpTool["handler"],
  };
}
