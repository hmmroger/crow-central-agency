import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(CONFIG_DIR, "..");
const DEFAULT_STATIC_DIR = path.join(DIST_DIR, "public");

function getOptional(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

function getOptionalNumber(key: string, defaultValue?: number): number | undefined {
  return process.env[key] ? parseInt(process.env[key], 10) : defaultValue;
}

function expandPath(filePath: string): string {
  if (filePath.startsWith("~")) {
    return path.join(os.homedir(), filePath.slice(1));
  }

  return path.resolve(filePath);
}

function readRequired(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }

  return value;
}

const nodeEnv = getOptional("NODE_ENV") ?? "development";
const isDev = nodeEnv === "development";
const corsOrigins = getOptional("CORS_ORIGINS") ?? "http://localhost:5101";
const crowSysPath = getOptional("CROW_SYSTEM_PATH") ?? path.join(os.homedir(), ".crow");

let cachedAccessKey: string | undefined;

function getAccessKey(): string {
  if (cachedAccessKey === undefined) {
    cachedAccessKey = readRequired("ACCESS_KEY");
  }

  return cachedAccessKey;
}

export const env = {
  get ACCESS_KEY(): string {
    return getAccessKey();
  },
  NODE_ENV: nodeEnv,
  IS_DEV: isDev,
  LOG_LEVEL: getOptional("LOG_LEVEL") ?? (isDev ? "debug" : "info"),
  HOST: getOptional("HOST") ?? "localhost",
  PORT: getOptionalNumber("PORT") ?? 3101,
  CORS_ORIGINS: corsOrigins.split(",").map((origin) => origin.trim()),
  CROW_SYSTEM_PATH: expandPath(crowSysPath),
  STATIC_PATH: expandPath(getOptional("STATIC_PATH") ?? DEFAULT_STATIC_DIR),
  CROW_SYSTEM_AGENT_NAME: getOptional("CROW_SYSTEM_AGENT_NAME"),
  CLAUDE_CLI_PATH: getOptional("CLAUDE_CLI_PATH"),
  CLOSED_TASK_RETENTION_DAYS: getOptionalNumber("CLOSED_TASK_RETENTION_DAYS", 30),
  FEED_ITEM_RETENTION_DAYS: getOptionalNumber("FEED_ITEM_RETENTION_DAYS", 30),
  FEED_REFRESH_IN_MINUTES: getOptionalNumber("FEED_REFRESH_IN_MINUTES"),
  TEXT_GENERATION_PROVIDER: getOptional("TEXT_GENERATION_PROVIDER"),
  TEXT_GENERATION_API_KEY: getOptional("TEXT_GENERATION_API_KEY"),
  TEXT_GENERATION_BASE_URL: getOptional("TEXT_GENERATION_BASE_URL"),
  TEXT_GENERATION_MODEL: getOptional("TEXT_GENERATION_MODEL"),
  FEED_TEXT_GENERATION_PROVIDER: getOptional("FEED_TEXT_GENERATION_PROVIDER"),
  FEED_TEXT_GENERATION_API_KEY: getOptional("FEED_TEXT_GENERATION_API_KEY"),
  FEED_TEXT_GENERATION_BASE_URL: getOptional("FEED_TEXT_GENERATION_BASE_URL"),
  FEED_TEXT_GENERATION_MODEL: getOptional("FEED_TEXT_GENERATION_MODEL"),
  AUDIO_GENERATION_PROVIDER: getOptional("AUDIO_GENERATION_PROVIDER"),
  AUDIO_GENERATION_API_KEY: getOptional("AUDIO_GENERATION_API_KEY"),
  AUDIO_GENERATION_MODEL: getOptional("AUDIO_GENERATION_MODEL", "gemini-3.1-flash-tts-preview"),
};

/**
 * Eagerly validate all required environment variables. Call once during boot
 * so the process fails fast with a clear error instead of deferring the throw
 * to whichever request first touches `env.ACCESS_KEY`.
 */
export function assertRequiredEnv(): void {
  getAccessKey();
}
