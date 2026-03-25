import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATIC_DIR = path.join(DIST_DIR, "public");

/**
 * Get optional environment variable
 */
function getOptional(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

function getOptionalNumber(key: string, defaultValue?: number): number | undefined {
  return process.env[key] ? parseInt(process.env[key], 10) : defaultValue;
}

const NODE_ENV = getOptional("NODE_ENV") ?? "development";
const IS_DEV = NODE_ENV === "development";
const CORS_ORIGINS = getOptional("CORS_ORIGINS") ?? "http://localhost:5101";
const CROW_SYSTEM_PATH = getOptional("CROW_SYSTEM_PATH") ?? ".crow";
const STATIC_PATH = getOptional("STATIC_PATH") ?? DEFAULT_STATIC_DIR;
const CLAUDE_CLI_PATH = getOptional("CLAUDE_CLI_PATH");

const OPENAI_BASE_URL = getOptional("OPENAI_BASE_URL");
const OPENAI = OPENAI_BASE_URL
  ? {
      baseURL: OPENAI_BASE_URL,
      apiKey: getOptional("OPENAI_API_KEY"),
      model: getOptional("OPENAI_MODEL"),
    }
  : undefined;

export const env = {
  NODE_ENV,
  IS_DEV,
  LOG_LEVEL: getOptional("LOG_LEVEL") ?? (IS_DEV ? "debug" : "info"),
  HOST: getOptional("HOST") ?? "localhost",
  PORT: getOptionalNumber("PORT") ?? 3030,
  CORS_ORIGINS: CORS_ORIGINS.split(",").map((origin) => origin.trim()),
  CROW_SYSTEM_PATH: path.resolve(CROW_SYSTEM_PATH),
  STATIC_PATH: path.resolve(STATIC_PATH),
  CLAUDE_CLI_PATH,
  OPENAI,
} as const;
