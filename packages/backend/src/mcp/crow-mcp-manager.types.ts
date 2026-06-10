import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/client";
import type { z, ZodRawShape } from "zod";
import type { MCP_CONFIG_TYPE } from "@crow-central-agency/shared";
import type { ConnectorProfile } from "../connectors/connector-manager.types.js";

export type McpServerConnectionsFunc = (agentId: string) => Promise<boolean>;
export type McpServerConnectionProfilesFunc = (
  agentId: string
) => Promise<Record<string, ConnectorProfile> | undefined>;

export type ToolHandler<InputArgs extends ZodRawShape> = (
  args: z.infer<z.ZodObject<InputArgs>>,
  extra: unknown
) => Promise<CallToolResult>;

export interface McpToolConfig<InputArgs extends ZodRawShape> {
  name: string;
  description: string;
  inputSchema: InputArgs;
  annotations?: ToolAnnotations;
  handler: ToolHandler<InputArgs>;
}

export type RegisteredMcpTool = McpToolConfig<ZodRawShape>;

/** Builds an internal server's tools for a specific agent (tools close over the agent id). */
export type InternalMcpToolsFactory = (agentId: string) => RegisteredMcpTool[];

/** Transport details for a local (stdio) user-configured MCP server. */
export interface LocalMcpTransport {
  type: typeof MCP_CONFIG_TYPE.STDIO;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** Transport details for a remote (SSE/HTTP) user-configured MCP server. */
export interface RemoteMcpTransport {
  type: typeof MCP_CONFIG_TYPE.SSE | typeof MCP_CONFIG_TYPE.HTTP;
  url: string;
  headers?: Record<string, string>;
}

/** Transport details for a user-configured MCP server, adapted per provider by each runner. */
export type CrowMcpTransport = LocalMcpTransport | RemoteMcpTransport;

/** Registration metadata for a built-in MCP server, supplied by each `getXxxMcpServerDefinition`. */
export interface McpServerDefinition {
  name: string;
  displayName?: string;
  /** Configurable servers are opt-in per agent and their tools follow normal permission rules. */
  isConfigurable?: boolean;
  /** When set, the server is only available to these agent IDs. */
  allowedAgentIds?: string[];
  getTools: InternalMcpToolsFactory;
  hasRequiredConnections?: McpServerConnectionsFunc;
  getConnectionProfiles?: McpServerConnectionProfilesFunc;
}

/** Fields shared by every per-agent resolved MCP server. */
export interface CrowMcpServerConfigBase {
  name: string;
  mcpToolPrefix: string;
  isAutoApproved?: boolean;
  connectionProfiles?: Record<string, ConnectorProfile>;
}

/** A built-in internal MCP server resolved for an agent, carrying its built tools. */
export interface InternalMcpServerConfig extends CrowMcpServerConfigBase {
  kind: "internal";
  tools: RegisteredMcpTool[];
}

/** A user-configured MCP server resolved for an agent, carrying its transport. */
export interface ExternalMcpServerConfig extends CrowMcpServerConfigBase {
  kind: "external";
  transport: CrowMcpTransport;
}

/** A per-agent resolved MCP server consumed by the provider runners. */
export type CrowMcpServerConfig = InternalMcpServerConfig | ExternalMcpServerConfig;
