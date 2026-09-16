import {
  DEFAULT_INSPECT_JSON_DEPTH,
  MAX_INSPECT_JSON_ARRAY_ITEMS,
  MAX_INSPECT_JSON_VALUE_LENGTH,
} from "./inspect-json.constants.js";
import type { JsonValue, RenderJsonOutlineOptions } from "./inspect-json.types.js";
import { appendJsonPathIndex, appendJsonPathKey } from "./json-path.js";

interface OutlineBudget {
  maxArrayItems: number;
  maxValueLength: number;
}

const TRUNCATION_ELLIPSIS = "…";
const OBJECT_MARKER = "{}";
const ARRAY_MARKER = "[]";
const ARRAY_REMAINDER_MARKER = `[${TRUNCATION_ELLIPSIS}]`;

const formatScalarValue = (value: JsonValue, maxValueLength: number): string => {
  if (typeof value === "string") {
    if (value.length <= maxValueLength) {
      return JSON.stringify(value);
    }

    return `${JSON.stringify(`${value.slice(0, maxValueLength)}${TRUNCATION_ELLIPSIS}`)} (${value.length} chars)`;
  }

  const encodedValue = JSON.stringify(value);
  if (encodedValue.length <= maxValueLength) {
    return encodedValue;
  }

  return `${encodedValue.slice(0, maxValueLength)}${TRUNCATION_ELLIPSIS} (${encodedValue.length} chars)`;
};

const appendNodeLines = (
  lines: string[],
  value: JsonValue,
  path: string,
  remainingDepth: number,
  budget: OutlineBudget
): void => {
  if (Array.isArray(value)) {
    lines.push(`${path}${ARRAY_MARKER} = ${value.length} items`);
    if (remainingDepth <= 0) {
      return;
    }

    const expandedCount = Math.min(value.length, budget.maxArrayItems);
    for (let index = 0; index < expandedCount; index += 1) {
      appendNodeLines(lines, value[index], appendJsonPathIndex(path, index), remainingDepth - 1, budget);
    }

    if (expandedCount < value.length) {
      const remainderPath = appendJsonPathIndex(path, expandedCount);
      lines.push(
        `${path}${ARRAY_REMAINDER_MARKER} = ${value.length - expandedCount} more items (use path="${remainderPath}")`
      );
    }

    return;
  }

  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    lines.push(`${path}${OBJECT_MARKER} = ${keys.length} keys`);
    if (remainingDepth <= 0) {
      return;
    }

    for (const key of keys) {
      appendNodeLines(lines, value[key], appendJsonPathKey(path, key), remainingDepth - 1, budget);
    }

    return;
  }

  const scalarText = formatScalarValue(value, budget.maxValueLength);
  lines.push(path ? `${path} = ${scalarText}` : `= ${scalarText}`);
};

/**
 * Renders a parsed JSON value as flattened `path = value` lines. Containers always emit their own count line;
 * containers reached at the depth cutoff emit that line without their children.
 */
export const renderJsonOutline = (value: JsonValue, options?: RenderJsonOutlineOptions): string[] => {
  const budget: OutlineBudget = {
    maxArrayItems: options?.maxArrayItems ?? MAX_INSPECT_JSON_ARRAY_ITEMS,
    maxValueLength: options?.maxValueLength ?? MAX_INSPECT_JSON_VALUE_LENGTH,
  };

  const lines: string[] = [];
  appendNodeLines(lines, value, options?.basePath ?? "", options?.depth ?? DEFAULT_INSPECT_JSON_DEPTH, budget);
  return lines;
};
