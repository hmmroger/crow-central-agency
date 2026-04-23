/**
 * OpenTelemetry SDK initialization.
 *
 * Loaded as a Node.js preload module via `--import` in the start scripts so the SDK
 * can register instrumentation hooks before HTTP/Fastify modules are imported.
 *
 * Controlled by the `OTEL_ENABLED` env var — when not "true", this module is a no-op.
 * Standard OTel env vars (OTEL_SERVICE_NAME, OTEL_TRACES_EXPORTER, OTEL_EXPORTER_OTLP_ENDPOINT)
 * are read by the SDK automatically for exporter configuration.
 */

import { Command } from "commander";
import { config as loadDotenv } from "dotenv";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { FastifyOtelInstrumentation } from "@fastify/otel";

interface PreflightOptions {
  envFile?: string;
}

const preflight = new Command();
preflight
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .helpOption(false)
  .option("--env-file <path>", "path to a .env file to load before startup");
preflight.parse(process.argv);

const { envFile } = preflight.opts<PreflightOptions>();
loadDotenv({ quiet: true, ...(envFile ? { path: envFile } : {}) });

const DEFAULT_SERVICE_NAME = "crow-central-agency";

let sdk: NodeSDK | undefined;
let otelInstrumentation: FastifyOtelInstrumentation | undefined;

if (process.env.OTEL_ENABLED === "true") {
  // Set default service name if not explicitly configured
  if (!process.env.OTEL_SERVICE_NAME) {
    process.env.OTEL_SERVICE_NAME = DEFAULT_SERVICE_NAME;
  }

  otelInstrumentation = new FastifyOtelInstrumentation();

  sdk = new NodeSDK({
    instrumentations: [otelInstrumentation, new HttpInstrumentation(), new UndiciInstrumentation()],
  });

  try {
    console.log("[telemetry] Starting otel...");
    sdk.start();
  } catch (error) {
    // Log and continue — broken telemetry must not prevent the server from starting.
    // Using console.error because the application logger (pino) is not yet initialized at preload time.
    console.error("[telemetry] Failed to start OpenTelemetry SDK, tracing disabled:", error);
    sdk = undefined;
    otelInstrumentation = undefined;
  }
}

/** The FastifyOtelInstrumentation instance, or undefined when telemetry is disabled */
export const fastifyOtelInstrumentation = otelInstrumentation;

/** Gracefully shut down the OpenTelemetry SDK, flushing any pending spans */
export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
  }
}
