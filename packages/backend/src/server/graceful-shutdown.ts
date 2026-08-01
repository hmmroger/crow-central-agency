import { SHUTDOWN_STEP_TIMEOUT_MS, SHUTDOWN_TOTAL_TIMEOUT_MS } from "../config/constants.js";
import { logger } from "../utils/logger.js";

export interface ShutdownStep {
  name: string;
  run: () => void | Promise<void>;
}

const log = logger.child({ context: "graceful-shutdown" });

const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

/**
 * Run a single step, racing it against a per-step timeout. A timeout or a thrown
 * error is logged and swallowed so one bad dependency cannot strand the process.
 */
async function runStep(step: ShutdownStep): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timed out after ${SHUTDOWN_STEP_TIMEOUT_MS}ms`)),
      SHUTDOWN_STEP_TIMEOUT_MS
    );
  });

  try {
    await Promise.race([Promise.resolve().then(() => step.run()), timeout]);
  } catch (error) {
    log.warn({ err: error, step: step.name }, "Shutdown step failed; continuing");
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/** Run all shutdown steps sequentially. Never rejects; each step is isolated. */
export async function runShutdownSteps(steps: ShutdownStep[]): Promise<void> {
  for (const step of steps) {
    await runStep(step);
  }
}

/**
 * Register SIGINT/SIGTERM handlers that run the given steps in order, bounded by a
 * total watchdog. A second signal during shutdown forces an immediate exit.
 */
export function registerShutdownHandlers(steps: ShutdownStep[]): void {
  let shuttingDown = false;

  const handleSignal = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      log.warn({ signal }, "Second shutdown signal received; forcing exit");
      process.exit(1);
    }

    shuttingDown = true;
    log.info({ signal }, "Shutting down...");

    // Not unref'd: this must fire even when nothing else keeps the loop alive.
    const watchdog = setTimeout(() => {
      log.error(`Shutdown exceeded ${SHUTDOWN_TOTAL_TIMEOUT_MS}ms; forcing exit`);
      process.exit(1);
    }, SHUTDOWN_TOTAL_TIMEOUT_MS);

    await runShutdownSteps(steps);

    clearTimeout(watchdog);
    log.info("Shutdown complete");
    process.exit(0);
  };

  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, handleSignal);
  }
}
