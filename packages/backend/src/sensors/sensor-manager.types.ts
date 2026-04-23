import type { ClientLocation } from "../server/request-context.types.js";

export interface SensorContext {
  timezone?: string;
  location?: ClientLocation;
}

export interface Sensor {
  readonly id: string;
  readonly name: string;
  getReading: (sensorContext: SensorContext) => Promise<string>;
}
