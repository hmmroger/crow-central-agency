import { z } from "zod";

/** Lightweight sensor descriptor returned by GET /api/sensors */
export const SensorInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type SensorInfo = z.infer<typeof SensorInfoSchema>;
