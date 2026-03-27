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

const nodeEnv = getOptional("NODE_ENV") ?? "development";
const isDev = nodeEnv === "development";
const corsOrigins = getOptional("CORS_ORIGINS") ?? "http://localhost:5101";
const openAIApiKey = getOptional("OPENAI_API_KEY");
const openAI = openAIApiKey
  ? {
      baseUrl: getOptional("OPENAI_BASE_URL"),
      apiKey: openAIApiKey,
      model: getOptional("OPENAI_MODEL"),
    }
  : undefined;

export const env = {
  NODE_ENV: nodeEnv,
  IS_DEV: isDev,
  LOG_LEVEL: getOptional("LOG_LEVEL") ?? (isDev ? "debug" : "info"),
  HOST: getOptional("HOST") ?? "localhost",
  PORT: getOptionalNumber("PORT") ?? 3030,
  CORS_ORIGINS: corsOrigins.split(",").map((origin) => origin.trim()),
  CROW_SYSTEM_PATH: path.resolve(getOptional("CROW_SYSTEM_PATH") ?? ".crow"),
  STATIC_PATH: path.resolve(getOptional("STATIC_PATH") ?? DEFAULT_STATIC_DIR),
  CLAUDE_CLI_PATH: getOptional("CLAUDE_CLI_PATH"),
  OPENAI: openAI,
} as const;
