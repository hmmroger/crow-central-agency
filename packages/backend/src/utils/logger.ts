import pino from "pino";
import { env } from "../config/env.js";

async function createLogger(): Promise<pino.Logger> {
  if (env.IS_DEV) {
    const pinoPretty = (await import("pino-pretty")).default;
    return pino({ level: env.LOG_LEVEL }, pinoPretty({ colorize: true, sync: true }));
  }

  return pino(
    { level: env.LOG_LEVEL },
    pino.transport({
      targets: [{ target: "pino/file", options: { destination: 1 } }],
    })
  );
}

export const logger = await createLogger();
