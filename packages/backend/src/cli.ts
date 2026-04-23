#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { logger } from "./utils/logger.js";
import { bootstrap } from "./bootstrap.js";

interface PackageManifest {
  version: string;
}

const packageManifest: PackageManifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const program = new Command();

program
  .name("crow")
  .description("Crow Central Agency - Multi-Instance Claude Code Orchestrator")
  .version(packageManifest.version)
  // --env-file is consumed by the telemetry/setup.ts preload (loaded via --import
  // in bin/crow.ts); declared here only so commander accepts it and shows it in --help.
  .option("--env-file <path>", "path to a .env file to load before startup");

program
  .command("server")
  .description("Start the API + WebSocket server (no static file serving)")
  .action(async () => {
    try {
      await bootstrap({ serveStatic: false });
    } catch (error) {
      logger.error(error, "Failed to start server");
      process.exit(1);
    }
  });

program
  .command("singlebox")
  .description("Start the API + WebSocket server with bundled frontend")
  .action(async () => {
    try {
      await bootstrap({ serveStatic: true });
    } catch (error) {
      logger.error(error, "Failed to start fullstack server");
      process.exit(1);
    }
  });

program.parse();
