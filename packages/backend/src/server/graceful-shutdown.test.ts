import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runShutdownSteps } from "./graceful-shutdown.js";
import { SHUTDOWN_STEP_TIMEOUT_MS } from "../config/constants.js";

describe("runShutdownSteps", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("continues to later steps when a step hangs past its timeout", async () => {
    const order: string[] = [];
    const steps = [
      { name: "hang", run: () => new Promise<void>(() => {}) },
      { name: "after", run: () => void order.push("after") },
    ];

    const sequence = runShutdownSteps(steps);
    await vi.advanceTimersByTimeAsync(SHUTDOWN_STEP_TIMEOUT_MS);
    await sequence;

    expect(order).toEqual(["after"]);
  });

  it("continues to later steps when a step throws", async () => {
    const order: string[] = [];
    const steps = [
      {
        name: "boom",
        run: () => {
          throw new Error("boom");
        },
      },
      { name: "after", run: () => void order.push("after") },
    ];

    await runShutdownSteps(steps);

    expect(order).toEqual(["after"]);
  });

  it("runs steps in order and clears the per-step timer on success", async () => {
    const order: string[] = [];
    const steps = [
      { name: "first", run: () => void order.push("first") },
      { name: "second", run: async () => void order.push("second") },
    ];

    await runShutdownSteps(steps);

    expect(order).toEqual(["first", "second"]);
  });
});
