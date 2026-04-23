import type { FastifyInstance } from "fastify";
import type { SensorManager } from "../sensors/sensor-manager.js";

/**
 * Register sensor routes.
 * GET /api/sensors - list all available sensors (id + name).
 */
export async function registerSensorRoutes(server: FastifyInstance, sensorManager: SensorManager): Promise<void> {
  server.get("/api/sensors", async () => {
    const sensors = sensorManager.getAllSensors();
    return { success: true, data: sensors };
  });
}
