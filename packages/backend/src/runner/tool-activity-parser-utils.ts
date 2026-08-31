export const COPILOT_PRIMITIVE_ARG_KEY = "_value";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toToolArgsRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return isRecord(value) ? value : {};
}

export function copilotToolEventArgumentsToRecord(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }

  if (isRecord(value)) {
    return value;
  }

  return { [COPILOT_PRIMITIVE_ARG_KEY]: value };
}
