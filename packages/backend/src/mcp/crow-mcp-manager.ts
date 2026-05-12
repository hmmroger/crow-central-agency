import {
  McpServerConfigSchema,
  CreateMcpConfigInputSchema,
  UpdateMcpConfigInputSchema,
  type McpServerConfig,
  type CreateMcpConfigInput,
  type UpdateMcpConfigInput,
  MCP_CONFIG_TYPE,
  CROW_SYSTEM_AGENT_ID,
  type InternalMcpConfig,
  type AgentConfig,
} from "@crow-central-agency/shared";
import { logger } from "../utils/logger.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { generateId, isCrowSystemAgent } from "../utils/id-utils.js";
import type { ObjectStoreProvider } from "../core/store/object-store.types.js";
import type {
  CrowMcpServerConfig,
  McpServerFactory,
  McpServerRegistration,
  RegisterMcpServerOptions,
} from "./crow-mcp-manager.types.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { SystemSettingsManager } from "../services/system-settings-manager.js";
import { FEED_MCP_SERVER_NAME } from "./feed/feed-mcp-server.js";

const log = logger.child({ context: "mcp-manager" });

/** Object store table name for MCP server configs */
export const MCP_CONFIG_STORE_TABLE = "mcp";

/**
 * MCP manager - registry for built-in MCP server factories and
 * CRUD for user-configured external MCP servers persisted via object store.
 */
export class CrowMcpManager {
  /** Built-in MCP server factories (registered programmatically at startup) */
  private mcpServers = new Map<string, McpServerRegistration>();
  /** User-configured external MCP servers (persisted to object store) */
  private mcpConfigs = new Map<string, McpServerConfig>();

  constructor(
    private readonly store: ObjectStoreProvider,
    private readonly systemSettingsManager: SystemSettingsManager,
    private readonly registry: AgentRegistry
  ) {}

  /**
   * Load persisted MCP configs from the object store on startup.
   */
  public async initialize(): Promise<void> {
    const storeEntries = await this.store.getAll<McpServerConfig>(MCP_CONFIG_STORE_TABLE);
    for (const entry of storeEntries) {
      const result = McpServerConfigSchema.safeParse(entry.value);
      if (!result.success) {
        log.warn({ issues: result.error.issues }, "Skipping invalid MCP config in object store");
        continue;
      }

      this.mcpConfigs.set(result.data.id, result.data);
    }

    log.info({ count: this.mcpConfigs.size }, "MCP configs loaded");
  }

  /** Register an MCP server factory. */
  public registerMcpServer(name: string, factory: McpServerFactory, options?: RegisterMcpServerOptions): void {
    this.mcpServers.set(name, {
      name,
      factory,
      allowedAgentIds: options?.allowedAgentIds ? new Set(options.allowedAgentIds) : undefined,
      isConfigurable: options?.isConfigurable,
      hasRequiredConnections: options?.hasRequiredConnections,
      getConnectionProfiles: options?.getConnectionProfiles,
      displayName: options?.displayName,
    });
    log.info(
      { name, restricted: !!options?.allowedAgentIds, configurable: !!options?.isConfigurable },
      "MCP server factory registered"
    );
  }

  public deregisterMcpServer(name: string): void {
    this.mcpServers.delete(name);
    log.info({ name }, "MCP server factory de-registered");
  }

  /** Get MCP servers available to a specific agent */
  public async getMcpServersForAgent(agentId: string): Promise<CrowMcpServerConfig[]> {
    const agentConfig = this.registry.getAgent(agentId);
    const configuredMcpIds = new Set(agentConfig.mcpServerIds ?? []);
    const agentMcpMap = new Map<string, CrowMcpServerConfig>();
    const serverRegistrations = await this.getInternalServerRegistrationsForAgent(agentId, agentConfig);
    for (const registration of serverRegistrations) {
      const hasConnections =
        !registration.hasRequiredConnections || (await registration.hasRequiredConnections(agentId));
      const connectionProfiles =
        hasConnections && registration.getConnectionProfiles
          ? await registration.getConnectionProfiles(agentId)
          : undefined;
      if (hasConnections && (!registration.isConfigurable || configuredMcpIds.has(registration.name))) {
        agentMcpMap.set(registration.name, {
          name: registration.name,
          serverFactory: registration.factory,
          // configurable MCPs are not hidden and tools can be configured
          isInternal: !registration.isConfigurable,
          connectionProfiles,
        });
      }
    }

    const userMcpConfigs = this.getUserMcpConfigs().filter((config) => {
      return (isCrowSystemAgent(agentId) && config.enableForCrow) || configuredMcpIds.has(config.id);
    });
    for (const config of userMcpConfigs) {
      const name = this.normalizeMcpName(config.name);
      if (agentMcpMap.has(name)) {
        log.warn({ configId: config.id, name }, "User MCP config name collides with an internal server, skipping");
        continue;
      }

      agentMcpMap.set(name, {
        name,
        serverFactory: () => {
          if (config.type === MCP_CONFIG_TYPE.STDIO) {
            return {
              type: config.type,
              command: config.command,
              args: config.args,
              env: config.env,
            };
          }

          return {
            type: config.type,
            url: config.url,
            headers: config.headers,
          };
        },
        isInternal: false,
      });
    }

    return Array.from(agentMcpMap.values());
  }

  /** Get MCP tool prefixes for a specific agent */
  public async getInternalMcpPrefixes(agentId: string): Promise<string[]> {
    const servers = await this.getMcpServersForAgent(agentId);
    return servers.filter((server) => server.isInternal).map(({ name }) => `mcp__${name}__`);
  }

  public getCompleteMcpToolName(serverName: string, toolName: string): string {
    return `mcp__${serverName}__${toolName}`;
  }

  public async getMcpConfigsForAgent(agentId: string): Promise<(McpServerConfig | InternalMcpConfig)[]> {
    const agentConfig = this.registry.getAgent(agentId);
    const serverRegistrations = await this.getInternalServerRegistrationsForAgent(agentId, agentConfig);
    const internalConfigs: InternalMcpConfig[] = [];
    for (const registration of serverRegistrations) {
      if (!registration.isConfigurable) {
        continue;
      }

      const hasConnections =
        !registration.hasRequiredConnections || (await registration.hasRequiredConnections(agentId));
      internalConfigs.push({
        type: MCP_CONFIG_TYPE.INTERNAL,
        id: registration.name,
        name: registration.name,
        displayName: registration.displayName,
        isDisabled: !hasConnections,
      });
    }

    return [...internalConfigs, ...this.getUserMcpConfigs()];
  }

  /** Get user-configured MCP server configs persisted to the object store */
  public getUserMcpConfigs(): McpServerConfig[] {
    return Array.from(this.mcpConfigs.values());
  }

  /**
   * Get a single MCP config by ID.
   * @throws AppError with MCP_CONFIG_NOT_FOUND if not found.
   */
  public getMcpConfig(configId: string): McpServerConfig {
    const config = this.mcpConfigs.get(configId);
    if (!config) {
      throw new AppError(`MCP config not found: ${configId}`, APP_ERROR_CODES.MCP_CONFIG_NOT_FOUND);
    }

    return config;
  }

  /** Add a new user-configured MCP server */
  public async addMcpConfig(input: CreateMcpConfigInput): Promise<McpServerConfig> {
    const validated = CreateMcpConfigInputSchema.parse(input);
    const id = generateId();

    // validated is already type-safe from Zod; only need to attach the generated id
    const config: McpServerConfig = { ...validated, id };

    this.mcpConfigs.set(id, config);
    await this.store.set(MCP_CONFIG_STORE_TABLE, id, config);

    log.info({ configId: id, name: config.name, type: config.type }, "MCP config added");

    return config;
  }

  /** Update an existing user-configured MCP server */
  public async updateMcpConfig(configId: string, input: UpdateMcpConfigInput): Promise<McpServerConfig> {
    const existing = this.getMcpConfig(configId);
    const validated = UpdateMcpConfigInputSchema.parse(input);

    // When the type changes (e.g. stdio -> sse), only carry over common base fields
    // to avoid leaking type-specific fields from the old config into the new shape.
    // NOTE: when adding new common fields to the schema, add them here too.
    const isTypeChange = validated.type !== existing.type;
    const base = isTypeChange
      ? {
          id: existing.id,
          name: existing.name,
          description: existing.description,
          isDisabled: existing.isDisabled,
          enableForCrow: existing.enableForCrow,
        }
      : existing;

    const updated = McpServerConfigSchema.parse({ ...base, ...validated, id: existing.id });

    this.mcpConfigs.set(configId, updated);
    await this.store.set(MCP_CONFIG_STORE_TABLE, configId, updated);

    log.info({ configId, name: updated.name, type: updated.type }, "MCP config updated");

    return updated;
  }

  /** Delete a user-configured MCP server */
  public async deleteMcpConfig(configId: string): Promise<void> {
    const existing = this.getMcpConfig(configId);

    this.mcpConfigs.delete(configId);
    await this.store.delete(MCP_CONFIG_STORE_TABLE, configId);

    log.info({ configId, name: existing.name }, "MCP config deleted");
  }

  private normalizeMcpName(name: string): string {
    return name.toLowerCase().replaceAll(" ", "_");
  }

  private async getInternalServerRegistrationsForAgent(
    agentId: string,
    agentConfig: AgentConfig
  ): Promise<McpServerRegistration[]> {
    const hasConfiguredFeedIds =
      agentId === CROW_SYSTEM_AGENT_ID
        ? (await this.systemSettingsManager.getSuperCrowSettings()).configuredFeeds.length > 0
        : !!agentConfig.configuredFeeds?.length;

    const serverRegistrations = Array.from(this.mcpServers.values()).filter(
      (registration) =>
        (!registration.allowedAgentIds || registration.allowedAgentIds.has(agentId)) &&
        (registration.name !== FEED_MCP_SERVER_NAME || hasConfiguredFeedIds)
    );

    return serverRegistrations;
  }
}
