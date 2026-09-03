import { describe, expect, it } from "vitest";
import { DAY_OF_WEEK, TIME_MODE } from "@crow-central-agency/shared";
import { formatScheduleTiming } from "./format-schedule-timing.js";

describe("formatScheduleTiming", () => {
  it("renders an interval in EVERY mode", () => {
    expect(formatScheduleTiming({ timeMode: TIME_MODE.EVERY, times: [{ minute: 30 }], daysOfWeek: [] })).toBe(
      "Every 30m"
    );
  });

  it("renders hours and minutes in EVERY mode", () => {
    expect(formatScheduleTiming({ timeMode: TIME_MODE.EVERY, times: [{ hour: 1, minute: 30 }], daysOfWeek: [] })).toBe(
      "Every 1h 30m"
    );
  });

  it("renders multiple clock times in AT mode", () => {
    expect(
      formatScheduleTiming({
        timeMode: TIME_MODE.AT,
        times: [{ hour: 9 }, { hour: 17 }],
        daysOfWeek: [
          DAY_OF_WEEK.MONDAY,
          DAY_OF_WEEK.TUESDAY,
          DAY_OF_WEEK.WEDNESDAY,
          DAY_OF_WEEK.THURSDAY,
          DAY_OF_WEEK.FRIDAY,
        ],
      })
    ).toBe("At 09:00, 17:00 · Mon–Fri");
  });

  it("renders a minute-only AT entry as hourly", () => {
    expect(formatScheduleTiming({ timeMode: TIME_MODE.AT, times: [{ minute: 5 }], daysOfWeek: [] })).toBe(
      "At :05 every hour"
    );
  });

  it("omits the day segment when every day is allowed", () => {
    expect(formatScheduleTiming({ timeMode: TIME_MODE.AT, times: [{ hour: 14, minute: 30 }], daysOfWeek: [] })).toBe(
      "At 14:30"
    );
  });

  it("keeps non-contiguous days as a list", () => {
    expect(
      formatScheduleTiming({
        timeMode: TIME_MODE.EVERY,
        times: [{ hour: 2 }],
        daysOfWeek: [DAY_OF_WEEK.MONDAY, DAY_OF_WEEK.WEDNESDAY, DAY_OF_WEEK.FRIDAY],
      })
    ).toBe("Every 2h · Mon, Wed, Fri");
  });

  it("collapses a run and lists the remainder", () => {
    expect(
      formatScheduleTiming({
        timeMode: TIME_MODE.EVERY,
        times: [{ minute: 15 }],
        daysOfWeek: [DAY_OF_WEEK.MONDAY, DAY_OF_WEEK.TUESDAY, DAY_OF_WEEK.WEDNESDAY, DAY_OF_WEEK.FRIDAY],
      })
    ).toBe("Every 15m · Mon–Wed, Fri");
  });

  it("orders days by the week regardless of selection order", () => {
    expect(
      formatScheduleTiming({
        timeMode: TIME_MODE.EVERY,
        times: [{ minute: 15 }],
        daysOfWeek: [DAY_OF_WEEK.SUNDAY, DAY_OF_WEEK.TUESDAY],
      })
    ).toBe("Every 15m · Tue, Sun");
  });

  it("reports an unset interval rather than inventing one", () => {
    expect(formatScheduleTiming({ timeMode: TIME_MODE.EVERY, times: [{}], daysOfWeek: [] })).toBe("Not scheduled");
  });

  it("reports empty AT entries rather than inventing a time", () => {
    expect(formatScheduleTiming({ timeMode: TIME_MODE.AT, times: [{}], daysOfWeek: [] })).toBe("Not scheduled");
  });
});
