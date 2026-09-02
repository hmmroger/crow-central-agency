import { z } from "zod";
import { DayOfWeekSchema, SchedulerTimeSchema, TIME_MODE, TimeModeSchema } from "./scheduler.schema.js";

/** Maximum length of a schedule name, enforced on the create/update input path. */
export const SCHEDULE_NAME_MAX_LENGTH = 64;

/** Maximum number of time entries allowed in a schedule */
export const MAX_SCHEDULE_TIMES = 12;

/**
 * A top-level schedule owned by the scheduler subsystem.
 * On fire it creates one task per target agent.
 */
export const ScheduleSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(SCHEDULE_NAME_MAX_LENGTH),
  message: z.string().min(1),
  enabled: z.boolean().default(false),
  agentIds: z.array(z.string()).default([]),
  /** Empty means every day */
  daysOfWeek: z.array(DayOfWeekSchema).default([]),
  timeMode: TimeModeSchema.default(TIME_MODE.EVERY),
  times: z.array(SchedulerTimeSchema).min(1).max(MAX_SCHEDULE_TIMES).default([{}]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  /** Epoch ms of the last fire; undefined until first fire. */
  lastFiredTimestamp: z.number().optional(),
  /** Set only by the legacy loop migration — provenance + idempotency guard. */
  migratedFromAgentId: z.string().optional(),
});

export type Schedule = z.infer<typeof ScheduleSchema>;

export const CreateScheduleInputSchema = ScheduleSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastFiredTimestamp: true,
  migratedFromAgentId: true,
});

export type CreateScheduleInput = z.infer<typeof CreateScheduleInputSchema>;

export const UpdateScheduleInputSchema = CreateScheduleInputSchema.partial();

export type UpdateScheduleInput = z.infer<typeof UpdateScheduleInputSchema>;
