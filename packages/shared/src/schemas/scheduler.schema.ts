import { z } from "zod";

export const DAY_OF_WEEK = {
  MONDAY: "monday",
  TUESDAY: "tuesday",
  WEDNESDAY: "wednesday",
  THURSDAY: "thursday",
  FRIDAY: "friday",
  SATURDAY: "saturday",
  SUNDAY: "sunday",
} as const;

export type DayOfWeek = (typeof DAY_OF_WEEK)[keyof typeof DAY_OF_WEEK];

/** Zod schema for DayOfWeek values */
export const DayOfWeekSchema = z.enum([
  DAY_OF_WEEK.MONDAY,
  DAY_OF_WEEK.TUESDAY,
  DAY_OF_WEEK.WEDNESDAY,
  DAY_OF_WEEK.THURSDAY,
  DAY_OF_WEEK.FRIDAY,
  DAY_OF_WEEK.SATURDAY,
  DAY_OF_WEEK.SUNDAY,
]);

/** Zod schema for TimeMode values */
export const TimeModeSchema = z.enum(["AT", "EVERY"]);
export type TimeModeType = z.infer<typeof TimeModeSchema>;
export const TIME_MODE = TimeModeSchema.enum;

/**
 * A single time point - hour and minute pair.
 * Both are optional to allow partial specs (e.g. minute-only for "every N minutes").
 */
export const SchedulerTimeSchema = z.object({
  hour: z.number().int().min(0).max(23).optional(),
  minute: z.number().int().min(0).max(59).optional(),
});

export type SchedulerTime = z.infer<typeof SchedulerTimeSchema>;
