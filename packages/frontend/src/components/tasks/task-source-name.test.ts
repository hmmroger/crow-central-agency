import { describe, expect, it } from "vitest";
import { AGENT_TASK_SOURCE_TYPE, AgentConfigSchema } from "@crow-central-agency/shared";
import { resolveTaskSourceName, type TaskSourceLookup } from "./task-source-name.js";

const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const SCHEDULE_ID = "22222222-2222-4222-8222-222222222222";

function makeLookup(scheduleNames: [string, string][] = []): TaskSourceLookup {
  const agent = AgentConfigSchema.parse({
    id: AGENT_ID,
    name: "News Reporter",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  return { agents: [agent], scheduleNames: new Map(scheduleNames) };
}

describe("resolveTaskSourceName", () => {
  it("names the schedule a task came from", () => {
    const lookup = makeLookup([[SCHEDULE_ID, "Daily digest"]]);

    expect(resolveTaskSourceName({ sourceType: AGENT_TASK_SOURCE_TYPE.LOOP, scheduleId: SCHEDULE_ID }, lookup)).toBe(
      "Schedule · Daily digest"
    );
  });

  it("falls back to the bare label when the schedule has been deleted", () => {
    expect(
      resolveTaskSourceName({ sourceType: AGENT_TASK_SOURCE_TYPE.LOOP, scheduleId: SCHEDULE_ID }, makeLookup())
    ).toBe("Schedule");
  });

  it("falls back to the bare label for a task predating schedules", () => {
    expect(resolveTaskSourceName({ sourceType: AGENT_TASK_SOURCE_TYPE.LOOP }, makeLookup())).toBe("Schedule");
  });

  it("resolves an agent source to the agent name", () => {
    expect(resolveTaskSourceName({ sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId: AGENT_ID }, makeLookup())).toBe(
      "News Reporter"
    );
  });

  it("falls back to a truncated id for an unknown agent", () => {
    expect(
      resolveTaskSourceName({ sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId: SCHEDULE_ID }, makeLookup())
    ).toBe(SCHEDULE_ID.slice(0, 8));
  });

  it("labels the remaining source types", () => {
    const lookup = makeLookup();

    expect(resolveTaskSourceName({ sourceType: AGENT_TASK_SOURCE_TYPE.REMINDER }, lookup)).toBe("Reminder");
    expect(resolveTaskSourceName({ sourceType: AGENT_TASK_SOURCE_TYPE.SYSTEM }, lookup)).toBe("System");
    expect(resolveTaskSourceName({ sourceType: AGENT_TASK_SOURCE_TYPE.USER }, lookup)).toBe("User");
  });
});
