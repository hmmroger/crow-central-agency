import { z } from "zod";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { formatLocalDateTime, formatLocalIsoDateTime, parseDateTimeWithTimezone } from "../../utils/date-utils.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

interface TimeInterpretation {
  epochMs: number;
  description: string;
}

export const CONVERT_TIME_TOOL_NAME = "convert_time";

const TIME_UNIT = {
  SECONDS: "seconds",
  MILLISECONDS: "milliseconds",
} as const;

const TIME_UNIT_VALUES = [TIME_UNIT.SECONDS, TIME_UNIT.MILLISECONDS];
const EPOCH_PATTERN = /^-?\d+$/;
const EPOCH_SECONDS_LIMIT = 1e11;
const MILLISECONDS_PER_SECOND = 1000;
const CONVERT_TIME_HEADER = "--- CONVERT TIME ---";
const EPOCH_EXAMPLE = "1789590030";
const DATETIME_EXAMPLE = "2026-09-16T11:20:30";
const TIMEZONE_EXAMPLE = "America/Los_Angeles";

const isKnownTimezone = (timezone: string): boolean => {
  try {
    new Date().toLocaleString("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
};

const isRepresentableEpoch = (epochMs: number): boolean => Number.isFinite(new Date(epochMs).getTime());

const interpretTimeValue = (
  value: string,
  unit: string | undefined,
  timezone: string
): TimeInterpretation | undefined => {
  const trimmedValue = value.trim();
  if (!EPOCH_PATTERN.test(trimmedValue)) {
    const epochMs = parseDateTimeWithTimezone(trimmedValue, timezone);
    return Number.isFinite(epochMs) ? { epochMs, description: "datetime string" } : undefined;
  }

  const epochValue = Number(trimmedValue);
  const resolvedUnit =
    unit ?? (Math.abs(epochValue) < EPOCH_SECONDS_LIMIT ? TIME_UNIT.SECONDS : TIME_UNIT.MILLISECONDS);
  const epochMs = resolvedUnit === TIME_UNIT.SECONDS ? epochValue * MILLISECONDS_PER_SECOND : epochValue;
  return { epochMs, description: `epoch ${resolvedUnit}` };
};

const formatTimeConversion = (
  interpretation: TimeInterpretation,
  timezone: string,
  isUserDefaultTimezone: boolean
): string[] => {
  const { epochMs } = interpretation;
  return [
    CONVERT_TIME_HEADER,
    `[Interpreted: ${interpretation.description}]`,
    `[Timezone: ${timezone}${isUserDefaultTimezone ? " (user default)" : ""}]`,
    `Local: ${formatLocalDateTime(epochMs, timezone)}`,
    `Local ISO: ${formatLocalIsoDateTime(epochMs, timezone)}`,
    `UTC ISO: ${new Date(epochMs).toISOString()}`,
    `Epoch seconds: ${Math.floor(epochMs / MILLISECONDS_PER_SECOND)}`,
    `Epoch ms: ${epochMs}`,
  ];
};

export function getConvertTimeToolConfig(sensorManager: SensorManager) {
  const inputSchema = {
    value: z
      .string()
      .min(1)
      .describe(
        `The time to convert: either an epoch number (e.g. ${EPOCH_EXAMPLE}) or a datetime string (e.g. ${DATETIME_EXAMPLE}). A datetime string without an offset is read as local time.`
      ),
    unit: z
      .enum(TIME_UNIT_VALUES)
      .optional()
      .describe(
        `Forces how an epoch value is read. Values: ${TIME_UNIT_VALUES.join(", ")}. Omit to auto-detect by magnitude.`
      ),
    timezone: z
      .string()
      .optional()
      .describe(`IANA timezone name (e.g. ${TIMEZONE_EXAMPLE}). Omit to use the user's timezone.`),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ value, unit, timezone }) => {
    try {
      const timezoneToUse = timezone ?? (await sensorManager.getUserTimezone());
      if (!isKnownTimezone(timezoneToUse)) {
        return textToolResult(
          [`Error: unknown timezone "${timezoneToUse}". Use an IANA timezone name such as ${TIMEZONE_EXAMPLE}.`],
          true
        );
      }

      const interpretation = interpretTimeValue(value, unit, timezoneToUse);
      if (!interpretation) {
        return textToolResult(
          [
            `Error: could not read "${value}" as a time. Provide an epoch number (e.g. ${EPOCH_EXAMPLE}) or a datetime string (e.g. ${DATETIME_EXAMPLE}).`,
          ],
          true
        );
      }

      if (!isRepresentableEpoch(interpretation.epochMs)) {
        return textToolResult(
          [
            `Error: "${value}" read as ${interpretation.description} is outside the representable date range. If it is microseconds or nanoseconds, convert it to milliseconds first.`,
          ],
          true
        );
      }

      return textToolResult(formatTimeConversion(interpretation, timezoneToUse, timezone === undefined));
    } catch (error) {
      return getErrorToolResult(error, "Failed to convert time.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: CONVERT_TIME_TOOL_NAME,
    description:
      "Convert a time value into every other form at once. Accepts an epoch number or a datetime string and returns the local time, local ISO, UTC ISO, epoch seconds and epoch milliseconds, along with how the input was interpreted. Use this instead of working out a date from an epoch yourself.",
    inputSchema,
    handler,
  };

  return config;
}
