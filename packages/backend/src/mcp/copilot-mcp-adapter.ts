import { convertMcpCallToolResult } from "@github/copilot-sdk";
import type { MCPServerConfig, Tool, ToolResultObject } from "@github/copilot-sdk";
import type { CallToolResult } from "@modelcontextprotocol/client";
import { z } from "zod";
import { MCP_CONFIG_TYPE } from "@crow-central-agency/shared";
import type { CrowMcpTransport, InternalMcpServerConfig, RegisteredMcpTool } from "./crow-mcp-manager.types.js";
import { buildStrictToolSchema, getValidationErrorToolResult } from "./tool-utils.js";

/** Content blocks `convertMcpCallToolResult` understands; audio/resource-links are dropped. */
type CopilotSupportedContent = Extract<CallToolResult["content"][number], { type: "text" | "image" | "resource" }>;

/** Flatten an internal server's tools into Copilot in-process tools, prefixed to keep `mcp__server__tool` names. */
export function toCopilotTools(server: InternalMcpServerConfig): Tool<Record<string, unknown>>[] {
  return server.tools.map((registeredTool) => toCopilotTool(registeredTool, server));
}

function toCopilotTool(
  registeredTool: RegisteredMcpTool,
  server: InternalMcpServerConfig
): Tool<Record<string, unknown>> {
  const inputSchema = buildStrictToolSchema(registeredTool.inputSchema);
  return {
    name: `${server.mcpToolPrefix}${registeredTool.name}`,
    description: registeredTool.description,
    parameters: z.toJSONSchema(inputSchema),
    handler: async (args, invocation) => {
      const parsed = inputSchema.safeParse(args);
      if (!parsed.success) {
        return toCopilotToolResult(getValidationErrorToolResult(registeredTool.name, parsed.error));
      }

      return toCopilotToolResult(await registeredTool.handler(parsed.data, invocation));
    },
    skipPermission: server.isAutoApproved,
  };
}

function toCopilotToolResult(result: CallToolResult): ToolResultObject {
  const content = result.content.filter(isCopilotSupportedContent);
  return convertMcpCallToolResult({ content, isError: result.isError });
}

function isCopilotSupportedContent(block: CallToolResult["content"][number]): block is CopilotSupportedContent {
  return block.type === "text" || block.type === "image" || block.type === "resource";
}

/** `tools: ["*"]` is required — without it the runtime leaves the server unconfigured. */
export function toCopilotMcpServer(transport: CrowMcpTransport): MCPServerConfig {
  if (transport.type === MCP_CONFIG_TYPE.STDIO) {
    return {
      type: transport.type,
      command: transport.command,
      args: transport.args,
      env: transport.env,
      tools: ["*"],
    };
  }

  return {
    type: transport.type,
    url: transport.url,
    headers: transport.headers,
    tools: ["*"],
  };
}
