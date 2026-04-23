import type { FastifyInstance } from "fastify";
import { CreateMcpConfigInputSchema, UpdateMcpConfigInputSchema } from "@crow-central-agency/shared";
import type { CrowMcpManager } from "../mcp/crow-mcp-manager.js";
import { wrapZodError } from "./route-utils.js";

/**
 * Register MCP config CRUD routes.
 * Manages user-configured external MCP servers via CrowMcpManager.
 */
export async function registerMcpRoutes(server: FastifyInstance, mcpManager: CrowMcpManager) {
  /** List all MCP configs */
  server.get("/api/mcp/configs", async () => {
    const configs = mcpManager.getAllMcpConfigs();

    return { success: true, data: configs };
  });

  /** Get a single MCP config by ID */
  server.get<{ Params: { id: string } }>("/api/mcp/configs/:id", async (request) => {
    const config = mcpManager.getMcpConfig(request.params.id);

    return { success: true, data: config };
  });

  /** Create a new MCP config */
  server.post<{ Body: unknown }>("/api/mcp/configs", async (request) => {
    try {
      const input = CreateMcpConfigInputSchema.parse(request.body);
      const config = await mcpManager.addMcpConfig(input);

      return { success: true, data: config };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Update an existing MCP config */
  server.patch<{ Params: { id: string }; Body: unknown }>("/api/mcp/configs/:id", async (request) => {
    try {
      const input = UpdateMcpConfigInputSchema.parse(request.body);
      const config = await mcpManager.updateMcpConfig(request.params.id, input);

      return { success: true, data: config };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Delete an MCP config */
  server.delete<{ Params: { id: string } }>("/api/mcp/configs/:id", async (request) => {
    await mcpManager.deleteMcpConfig(request.params.id);

    return { success: true, data: { deleted: true } };
  });
}
