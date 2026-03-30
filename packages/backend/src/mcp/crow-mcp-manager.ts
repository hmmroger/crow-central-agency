import { logger } from "../utils/logger.js";
import type { McpServerFactory } from "./crow-mcp-manager.types.js";

const log = logger.child({ context: "mcp-manager" });

export class CrowMcpManager {
  private mcpServerFactories = new Map<string, McpServerFactory>();

  constructor() {}

  public registerMcpServer(name: string, factory: McpServerFactory): void {
    this.mcpServerFactories.set(name, factory);
    log.info({ name }, "MCP server factory registered");
  }

  public deregisterMcpServer(name: string): void {
    this.mcpServerFactories.delete(name);
    log.info({ name }, "MCP server factory de-registered");
  }

  public getAllMcpServer(): { name: string; serverFactory: McpServerFactory }[] {
    return Array.from(this.mcpServerFactories.entries()).map(([name, factory]) => ({
      name,
      serverFactory: factory,
    }));
  }

  public getMcpPrefixes(): string[] {
    return [...this.mcpServerFactories.keys()].map((serverName) => `mcp__${serverName}__`);
  }
}
