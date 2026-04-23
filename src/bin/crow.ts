#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const telemetrySetupUrl = new URL("../telemetry/setup.js", import.meta.url);
const cliPath = fileURLToPath(new URL("../cli.js", import.meta.url));

const cliArgs = ["singlebox", ...process.argv.slice(2)];
const child = spawn(process.execPath, ["--import", telemetrySetupUrl.href, cliPath, ...cliArgs], {
  stdio: "inherit",
});

const forwardSignal = (signal: NodeJS.Signals) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", forwardSignal);
process.on("SIGTERM", forwardSignal);
process.on("SIGHUP", forwardSignal);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
