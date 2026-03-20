#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { logger } from "./utils/logger.js";

const program = new Command();

program.name("crow").description("Crow Central Agency — Multi-Instance Claude Code Orchestrator").version("0.1.0");

program
  .command("server")
  .description("Start the orchestrator server")
  .action(async () => {
    logger.info("Starting server...");
  });

program.parse();
