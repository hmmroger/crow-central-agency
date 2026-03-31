#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { logger } from "./utils/logger.js";
import { bootstrap } from "./bootstrap.js";

const program = new Command();

program.name("crow").description("Crow Central Agency - Multi-Instance Claude Code Orchestrator").version("0.1.0");

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
  .command("fullstack")
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
