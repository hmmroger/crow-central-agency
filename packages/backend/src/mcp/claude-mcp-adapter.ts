import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance, McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { ZodType } from "zod";
import { MCP_CONFIG_TYPE } from "@crow-central-agency/shared";
import type { CrowMcpTransport, RegisteredMcpTool } from "./crow-mcp-manager.types.js";
import { buildStrictToolSchema } from "./tool-utils.js";

/** Internal shape of a Claude SDK in-process MCP server exposing its mutable registered tools. */
interface McpServerWithRegisteredTools {
  _registeredTools: Record<string, { inputSchema?: ZodType }>;
}

const hasRegisteredTools = (instance: object): instance is McpServerWithRegisteredTools => {
  if (!("_registeredTools" in instance)) {
    return false;
  }

  const registeredTools = instance._registeredTools;
  return typeof registeredTools === "object" && registeredTools !== null;
};

/**
 * Swap each registered tool's input schema for a strict variant so unknown parameters are rejected instead of
 * silently dropped. The raw shape is passed to tool() first so the SDK caches per-field descriptions; the strict
 * object reuses the same field instances, so those descriptions survive the swap (a strict object passed directly
 * to tool() would lose them). Guarded so an SDK internals change degrades to the default lenient
 * behavior rather than throwing.
 */
function applyStrictToolSchemas(instance: object, tools: RegisteredMcpTool[]): void {
  if (!hasRegisteredTools(instance)) {
    return;
  }

  for (const registeredTool of tools) {
    const entry = instance._registeredTools[registeredTool.name];
    if (entry) {
      entry.inputSchema = buildStrictToolSchema(registeredTool.inputSchema);
    }
  }
}

/** Wrap a server's registered tools into an in-process Claude SDK MCP server with strict parameter validation. */
export function toClaudeServer(name: string, tools: RegisteredMcpTool[]): McpSdkServerConfigWithInstance {
  const server = createSdkMcpServer({
    name,
    tools: tools.map((registeredTool) =>
      tool(registeredTool.name, registeredTool.description, registeredTool.inputSchema, registeredTool.handler, {
        annotations: registeredTool.annotations,
      })
    ),
  });

  applyStrictToolSchemas(server.instance, tools);
  return server;
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
