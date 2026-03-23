/**
 * Time modes for loop scheduling.
 *
 * "at" — trigger at a specific time point each cycle
 * "every" — trigger at recurring intervals
 */
export const TIME_MODE = {
  AT: "at",
  EVERY: "every",
} as const;

export type TimeMode = (typeof TIME_MODE)[keyof typeof TIME_MODE];
