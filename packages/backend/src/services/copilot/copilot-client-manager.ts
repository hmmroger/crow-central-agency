import path from "node:path";
import type { ModelOption } from "@crow-central-agency/shared";
import { CopilotClient } from "@github/copilot-sdk";
import { env } from "../../config/env.js";
import { SYSTEM_AGENTS_PROJECT_DIR_NAME } from "../../config/constants.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import { logger } from "../../utils/logger.js";

const log = logger.child({ context: "copilot-client-manager" });

/**
 * Process-wide owner of the shared Copilot SDK client. Provides the read interface SessionManager
 * uses to load session history, a probed availability flag, and the catalog of models the Copilot
 * provider supports. Per-agent run clients are owned by the runner; this client never runs agent
 * queries. Started once at bootstrap so reads never pay a connection cost.
 */
export class CopilotClientManager {
  private client?: CopilotClient;
  private available = false;
  private modelOptions?: ModelOption[];

  /**
   * Start the shared Copilot SDK client at startup. The SDK spawns its bundled runtime, so starting
   * succeeds even without a Copilot CLI install or login; availability hinges on authentication.
   */
  public async initialize(): Promise<void> {
    if (env.DISABLE_GITHUB_COPILOT) {
      log.info("DISABLE_GITHUB_COPILOT is set; skipping Copilot client startup");
      return;
    }

    const workingDirectory = path.join(env.CROW_SYSTEM_PATH, SYSTEM_AGENTS_PROJECT_DIR_NAME);
    const client = new CopilotClient({ workingDirectory });
    try {
      await client.start();
      const authStatus = await client.getAuthStatus();
      if (!authStatus.isAuthenticated) {
        log.warn({ authStatus }, "Copilot is not authenticated; Copilot agents are disabled");
        await this.stopQuietly(client);
        return;
      }

      this.client = client;
      this.available = true;
    } catch (error) {
      log.warn({ error }, "Copilot client unavailable; Copilot agents are disabled");
      await this.stopQuietly(client);
    }
  }

  /** Whether the Copilot SDK client started successfully during initialize. */
  public isAvailable(): boolean {
    return this.available;
  }

  /** The shared read client started during initialize. Throws if Copilot is unavailable. */
  public getClient(): CopilotClient {
    if (!this.client) {
      throw new AppError("Copilot client is not available", APP_ERROR_CODES.NOT_SUPPORTED);
    }

    return this.client;
  }

  /**
   * Models the Copilot provider exposes, as `{ value, label }` options. Returns an empty list when
   * Copilot is unavailable or the lookup fails; caches the result after the first successful fetch.
   */
  public async listModelOptions(): Promise<ModelOption[]> {
    if (this.modelOptions) {
      return this.modelOptions;
    }

    if (!this.client) {
      return [];
    }

    try {
      const models = await this.client.listModels();
      this.modelOptions = models.map((model) => ({ value: model.id, label: model.name }));
      return this.modelOptions;
    } catch (error) {
      log.warn({ error }, "Failed to list Copilot models");
      return [];
    }
  }

  /** Stop the shared client (and its CLI server) on shutdown. On-disk session state is preserved. */
  public async dispose(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.available = false;
    if (client) {
      await this.stopQuietly(client);
    }
  }

  private async stopQuietly(client: CopilotClient): Promise<void> {
    try {
      await client.stop();
    } catch (error) {
      log.warn({ error }, "Failed to stop Copilot client");
    }
  }
}
