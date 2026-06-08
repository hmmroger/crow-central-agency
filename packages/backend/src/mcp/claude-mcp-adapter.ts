import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance, McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { MCP_CONFIG_TYPE } from "@crow-central-agency/shared";
import type { CrowMcpTransport, RegisteredMcpTool } from "./crow-mcp-manager.types.js";

/** Wrap a server's registered tools into an in-process Claude SDK MCP server. */
export function toClaudeServer(name: string, tools: RegisteredMcpTool[]): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name,
    tools: tools.map((registeredTool) =>
      tool(registeredTool.name, registeredTool.description, registeredTool.inputSchema, registeredTool.handler, {
        annotations: registeredTool.annotations,
      })
    ),
  });
}

/** Map a Crow MCP transport to the Claude SDK's stdio/http/sse server config. */
export function toClaudeTransport(transport: CrowMcpTransport): McpServerConfig {
  if (transport.type === MCP_CONFIG_TYPE.STDIO) {
    return {
      type: transport.type,
      command: transport.command,
      args: transport.args,
      env: transport.env,
    };
  }

  return {
    type: transport.type,
    url: transport.url,
    headers: transport.headers,
  };
}
