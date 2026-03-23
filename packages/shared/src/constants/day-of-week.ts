/**
 * Day of week values for loop scheduling
 */
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
