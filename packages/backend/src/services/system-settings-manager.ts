import {
  CROW_SYSTEM_AGENT_ID,
  DashboardSettingsSchema,
  SuperCrowSettingsSchema,
  type DashboardSettings,
  type SuperCrowSettings,
  type UpdateDashboardSettingsInput,
  type UpdateSuperCrowSettingsInput,
} from "@crow-central-agency/shared";
import type { ObjectStoreProvider } from "../core/store/object-store.types.js";

const SYSTEM_SETTINGS_TABLE = "system-settings";
const DASHBOARD_SETTINGS_KEY = "dashboard";

/**
 * Read/write records in the `system-settings` table.
 *
 * Rows fall into two categories:
 *  - System-agent-scoped rows keyed by the agent's id (e.g. Super Crow).
 *  - UX-scoped rows keyed by a well-known string (e.g. DASHBOARD_SETTINGS_KEY).
 * Typed accessors keep the consumer side explicit and avoid accidental cross-use.
 */
export class SystemSettingsManager {
  constructor(private readonly store: ObjectStoreProvider) {}

  public async getSuperCrowSettings(): Promise<SuperCrowSettings> {
    const entry = await this.store.get<SuperCrowSettings>(SYSTEM_SETTINGS_TABLE, CROW_SYSTEM_AGENT_ID);
    return entry?.value ?? SuperCrowSettingsSchema.parse({});
  }

  public async updateSuperCrowSettings(input: UpdateSuperCrowSettingsInput): Promise<SuperCrowSettings> {
    const current = await this.getSuperCrowSettings();
    const next = SuperCrowSettingsSchema.parse({ ...current, ...input });
    await this.store.set<SuperCrowSettings>(SYSTEM_SETTINGS_TABLE, CROW_SYSTEM_AGENT_ID, next);
    return next;
  }

  public async getDashboardSettings(): Promise<DashboardSettings> {
    const entry = await this.store.get<DashboardSettings>(SYSTEM_SETTINGS_TABLE, DASHBOARD_SETTINGS_KEY);
    return entry?.value ?? DashboardSettingsSchema.parse({});
  }

  public async updateDashboardSettings(input: UpdateDashboardSettingsInput): Promise<DashboardSettings> {
    const current = await this.getDashboardSettings();
    // circleAgentOrder is a per-circle map; partial updates carry the entries
    // for one circle at a time. Merge at the record level so other circles
    // keep their saved order.
    const mergedCircleAgentOrder =
      input.circleAgentOrder === undefined
        ? current.circleAgentOrder
        : { ...current.circleAgentOrder, ...input.circleAgentOrder };
    // pinnedAgentOrder is a single flat list — partial updates always carry
    // the full new order, so replace on provide.
    const nextPinnedAgentOrder = input.pinnedAgentOrder ?? current.pinnedAgentOrder;
    const next = DashboardSettingsSchema.parse({
      ...current,
      ...input,
      circleAgentOrder: mergedCircleAgentOrder,
      pinnedAgentOrder: nextPinnedAgentOrder,
    });
    await this.store.set<DashboardSettings>(SYSTEM_SETTINGS_TABLE, DASHBOARD_SETTINGS_KEY, next);
    return next;
  }
}
