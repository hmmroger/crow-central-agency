import type { FastifyInstance } from "fastify";
import { UpdateDashboardSettingsInputSchema, UpdateSuperCrowSettingsInputSchema } from "@crow-central-agency/shared";
import type { SystemSettingsManager } from "../services/system-settings-manager.js";
import { wrapZodError } from "./route-utils.js";

/**
 * Register system-settings routes.
 * System agents (e.g. Super Crow) cannot be edited through the standard
 * agent editor; these endpoints let the user configure the slice of
 * behavior we do allow. UX-scoped rows (e.g. dashboard) also live here.
 */
export async function registerSystemSettingsRoutes(
  server: FastifyInstance,
  systemSettingsManager: SystemSettingsManager
) {
  /** Get Super Crow settings */
  server.get("/api/system-settings/super-crow", async () => {
    const settings = await systemSettingsManager.getSuperCrowSettings();
    return { success: true, data: settings };
  });

  /** Update Super Crow settings (partial) */
  server.patch<{ Body: unknown }>("/api/system-settings/super-crow", async (request) => {
    try {
      const input = UpdateSuperCrowSettingsInputSchema.parse(request.body);
      const settings = await systemSettingsManager.updateSuperCrowSettings(input);
      return { success: true, data: settings };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Get dashboard settings */
  server.get("/api/system-settings/dashboard", async () => {
    const settings = await systemSettingsManager.getDashboardSettings();
    return { success: true, data: settings };
  });

  /** Update dashboard settings (partial) */
  server.patch<{ Body: unknown }>("/api/system-settings/dashboard", async (request) => {
    try {
      const input = UpdateDashboardSettingsInputSchema.parse(request.body);
      const settings = await systemSettingsManager.updateDashboardSettings(input);
      return { success: true, data: settings };
    } catch (error) {
      return wrapZodError(error);
    }
  });
}
