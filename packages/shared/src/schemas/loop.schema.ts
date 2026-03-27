import { z } from "zod";
import { DAY_OF_WEEK } from "../constants/day-of-week.js";

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
 * Loop configuration schema — single source of truth.
 * Used both standalone and embedded in AgentConfigSchema.
 *
 * timeMode "at" — trigger at a specific time point each cycle:
 *   minute: 5         → tick at XX:05 every hour (01:05, 02:05, ...)
 *   hour: 14          → tick at 14:00 daily
 *   hour: 14, min: 30 → tick at 14:30 daily
 *
 * timeMode "every" — trigger at recurring intervals:
 *   minute: 15            → tick every 15 minutes
 *   hour: 2               → tick every 2 hours
 *   hour: 1, minute: 30   → tick every 1h 30m
 */
export const LoopConfigSchema = z.object({
  enabled: z.boolean().default(false),
  daysOfWeek: z.array(DayOfWeekSchema).default([]),
  timeMode: TimeModeSchema.default(TIME_MODE.EVERY),
  hour: z.number().min(0).max(23).optional(),
  minute: z.number().min(0).max(59).optional(),
  prompt: z.string(),
});

export type LoopConfig = z.infer<typeof LoopConfigSchema>;
