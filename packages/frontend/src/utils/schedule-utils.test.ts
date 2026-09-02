import { describe, expect, it } from "vitest";
import { ScheduleSchema, TIME_MODE, type Schedule } from "@crow-central-agency/shared";
import { selectSchedulesForAgent } from "./schedule-utils.js";

const REPORTER_ID = "11111111-1111-4111-8111-111111111111";
const ANALYST_ID = "22222222-2222-4222-8222-222222222222";
const OBSERVER_ID = "33333333-3333-4333-8333-333333333333";

function makeSchedule(id: string, name: string, enabled: boolean, agentIds: string[]): Schedule {
  return ScheduleSchema.parse({
    id,
    name,
    message: "Do the thing",
    enabled,
    agentIds,
    daysOfWeek: [],
    timeMode: TIME_MODE.EVERY,
    times: [{ minute: 30 }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

const dailyDigest = makeSchedule("44444444-4444-4444-8444-444444444444", "Daily digest", true, [
  REPORTER_ID,
  ANALYST_ID,
]);
const analystOnly = makeSchedule("55555555-5555-4555-8555-555555555555", "Analyst only", false, [ANALYST_ID]);

describe("selectSchedulesForAgent", () => {
  it("lists a multi-agent schedule under every agent it targets", () => {
    const schedules = [dailyDigest, analystOnly];

    expect(selectSchedulesForAgent(schedules, REPORTER_ID).map((schedule) => schedule.name)).toEqual(["Daily digest"]);
    expect(selectSchedulesForAgent(schedules, ANALYST_ID).map((schedule) => schedule.name)).toEqual([
      "Daily digest",
      "Analyst only",
    ]);
  });

  it("returns nothing for an agent no schedule targets", () => {
    expect(selectSchedulesForAgent([dailyDigest, analystOnly], OBSERVER_ID)).toEqual([]);
  });

  it("orders enabled schedules first, then by name within each group", () => {
    const zebra = makeSchedule("66666666-6666-4666-8666-666666666666", "Zebra sweep", true, [ANALYST_ID]);
    const alpha = makeSchedule("77777777-7777-4777-8777-777777777777", "Alpha sweep", true, [ANALYST_ID]);
    const bravo = makeSchedule("88888888-8888-4888-8888-888888888888", "Bravo sweep", false, [ANALYST_ID]);

    expect(
      selectSchedulesForAgent([analystOnly, zebra, bravo, alpha], ANALYST_ID).map((schedule) => schedule.name)
    ).toEqual(["Alpha sweep", "Zebra sweep", "Analyst only", "Bravo sweep"]);
  });
});
