import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expandPath } from "../utils/fs-utils.js";

const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(CONFIG_DIR, "..");
const DEFAULT_STATIC_DIR = path.join(DIST_DIR, "public");

function getOptional(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

function getOptionalNumber(key: string, defaultValue?: number): number | undefined {
  return process.env[key] ? parseInt(process.env[key], 10) : defaultValue;
}

function getBoolean(key: string): boolean {
  const value = process.env[key]?.trim().toLowerCase();
  return value === "true" || value === "1";
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
const host = getOptional("HOST") ?? "localhost";
const port = getOptionalNumber("PORT") ?? 3101;
// Default value for single-box deployment.
const backendOrigin = `http://${host}:${port}`;
const corsOrigins = getOptional("CORS_ORIGINS") ?? backendOrigin;
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
  HOST: host,
  PORT: port,
  CORS_ORIGINS: corsOrigins.split(",").map((origin) => origin.trim()),
  CROW_SYSTEM_PATH: expandPath(crowSysPath),
  STATIC_PATH: expandPath(getOptional("STATIC_PATH") ?? DEFAULT_STATIC_DIR),
  CROW_SYSTEM_AGENT_NAME: getOptional("CROW_SYSTEM_AGENT_NAME"),
  CLAUDE_CLI_PATH: getOptional("CLAUDE_CLI_PATH"),
  DISABLE_GITHUB_COPILOT: getBoolean("DISABLE_GITHUB_COPILOT"),
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
  FEED_MAX_SUMMARIZATION_ITEMS: getOptionalNumber("FEED_MAX_SUMMARIZATION_ITEMS"),
  AUDIO_GENERATION_PROVIDER: getOptional("AUDIO_GENERATION_PROVIDER"),
  AUDIO_GENERATION_API_KEY: getOptional("AUDIO_GENERATION_API_KEY"),
  AUDIO_GENERATION_MODEL: getOptional("AUDIO_GENERATION_MODEL", "gemini-3.1-flash-tts-preview"),
  CONNECTOR_CALLBACK_URL: getOptional("CONNECTOR_CALLBACK_URL") ?? `${backendOrigin}/auth/callback`,
  GOOGLE_CONNECTOR_CLIENT_ID: getOptional("GOOGLE_CONNECTOR_CLIENT_ID"),
  GOOGLE_CONNECTOR_CLIENT_SECRET: getOptional("GOOGLE_CONNECTOR_CLIENT_SECRET"),
  OAUTH_PENDING_STATE_TTL_MS: getOptionalNumber("OAUTH_PENDING_STATE_TTL_MS", 600_000),
  GMAIL_CHECK_INTERVAL_IN_MINUTES: getOptionalNumber("GMAIL_CHECK_INTERVAL_IN_MINUTES"),
  PHOTON_API_URL: getOptional("PHOTON_API_URL") ?? "https://photon.komoot.io",
  OVERPASS_INTERPRETER_URL: getOptional("OVERPASS_INTERPRETER_URL") ?? "https://overpass-api.de/api/interpreter",
};

/**
 * Eagerly validate all required environment variables. Call once during boot
 * so the process fails fast with a clear error instead of deferring the throw
 * to whichever request first touches `env.ACCESS_KEY`.
 */
export function assertRequiredEnv(): void {
  getAccessKey();
}
