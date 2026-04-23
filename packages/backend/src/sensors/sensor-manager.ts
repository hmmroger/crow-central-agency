import { logger } from "../utils/logger.js";
import type { Sensor, SensorContext } from "./sensor-manager.types.js";
import type { ObjectStoreProvider } from "../core/store/object-store.types.js";
import { CLIENT_STORE_LOCATION_KEY, CLIENT_STORE_TABLE, CLIENT_STORE_TIMEZONE_KEY } from "../config/constants.js";
import type { ClientLocation } from "../server/request-context.types.js";
import { DEFAULT_TIMEZONE } from "../server/request-context.js";

const log = logger.child({ context: "sensor-manager" });

export class SensorManager {
  private sensors: Map<string, Sensor> = new Map();

  constructor(private readonly store: ObjectStoreProvider) {}

  public async getSensorContext(): Promise<SensorContext> {
    const savedTimezone = await this.store.get<string>(CLIENT_STORE_TABLE, CLIENT_STORE_TIMEZONE_KEY);
    const savedLocation = await this.store.get<ClientLocation>(CLIENT_STORE_TABLE, CLIENT_STORE_LOCATION_KEY);
    return {
      timezone: savedTimezone?.value,
      location: savedLocation?.value,
    };
  }

  /** Resolve the user's timezone, falling back to the server default if none is set. */
  public async getUserTimezone(): Promise<string> {
    const { timezone } = await this.getSensorContext();
    return timezone ?? DEFAULT_TIMEZONE;
  }

  public registerSensor(sensor: Sensor): void {
    this.sensors.set(sensor.id, sensor);
    log.info({ id: sensor.id }, "Sensor registered");
  }

  public deregisterSensor(id: string): void {
    if (this.sensors.has(id)) {
      this.sensors.delete(id);
      log.info({ id }, "Sensor de-registered");
    }
  }

  /** Get all registered sensors as id/name pairs */
  public getAllSensors(): Array<{ id: string; name: string }> {
    return Array.from(this.sensors.values()).map((sensor) => ({ id: sensor.id, name: sensor.name }));
  }

  public getSensor(id: string): Sensor | undefined {
    return this.sensors.get(id);
  }
}
