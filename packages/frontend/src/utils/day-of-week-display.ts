import { DAY_OF_WEEK, type DayOfWeek } from "@crow-central-agency/shared";

/** Short display label per day */
export const DAY_LABELS: Record<DayOfWeek, string> = {
  [DAY_OF_WEEK.MONDAY]: "Mon",
  [DAY_OF_WEEK.TUESDAY]: "Tue",
  [DAY_OF_WEEK.WEDNESDAY]: "Wed",
  [DAY_OF_WEEK.THURSDAY]: "Thu",
  [DAY_OF_WEEK.FRIDAY]: "Fri",
  [DAY_OF_WEEK.SATURDAY]: "Sat",
  [DAY_OF_WEEK.SUNDAY]: "Sun",
};

/** Week order used for day pickers and for collapsing contiguous runs */
export const WEEK_ORDER: DayOfWeek[] = [
  DAY_OF_WEEK.MONDAY,
  DAY_OF_WEEK.TUESDAY,
  DAY_OF_WEEK.WEDNESDAY,
  DAY_OF_WEEK.THURSDAY,
  DAY_OF_WEEK.FRIDAY,
  DAY_OF_WEEK.SATURDAY,
  DAY_OF_WEEK.SUNDAY,
];
