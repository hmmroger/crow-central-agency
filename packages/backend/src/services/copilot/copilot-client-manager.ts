import path from "node:path";
import { type ModelOption, type ReasoningEffort, ReasoningEffortSchema } from "@crow-central-agency/shared";
import { CopilotClient } from "@github/copilot-sdk";
import { env } from "../../config/env.js";
import { SYSTEM_AGENTS_PROJECT_DIR_NAME } from "../../config/constants.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import { logger } from "../../utils/logger.js";

const log = logger.child({ context: "copilot-client-manager" });
const COPILOT_CLIENT_CLEANUP_MAX_MS = 3 * 1000;

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
   * Models the Copilot provider exposes, as model options carrying each model's reasoning effort
   * capability. Returns an empty list when Copilot is unavailable or the lookup fails; caches the
   * result after the first successful fetch.
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
      this.modelOptions = models.map((model) => ({
        value: model.id,
        label: model.name,
        supportedEfforts: this.toSupportedEfforts(
          model.capabilities.supports.reasoningEffort,
          model.supportedReasoningEfforts
        ),
      }));
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
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AppError("Timeout", APP_ERROR_CODES.TIMEOUT)), COPILOT_CLIENT_CLEANUP_MAX_MS);
    });

    try {
      const stopPromise = client.stop();
      await Promise.race([stopPromise, timeout]);
    } catch (error) {
      if (error instanceof AppError && error.errorCode === APP_ERROR_CODES.TIMEOUT) {
        log.warn({ error }, "Force stop Copilot client");
        await client.forceStop();
      } else {
        log.warn({ error }, "Failed to stop Copilot client");
      }
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private toSupportedEfforts(
    supportsReasoningEffort: boolean,
    efforts: readonly string[] | undefined
  ): ReasoningEffort[] | undefined {
    if (!supportsReasoningEffort || !efforts) {
      return undefined;
    }

    const supported: ReasoningEffort[] = [];
    for (const effort of efforts) {
      const parsed = ReasoningEffortSchema.safeParse(effort);
      if (parsed.success) {
        supported.push(parsed.data);
      }
    }

    return supported.length > 0 ? supported : undefined;
  }
}
