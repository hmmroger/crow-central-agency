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
  AGENT_TYPE,
} from "@crow-central-agency/shared";
import { logger } from "../utils/logger.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { generateId, isCrowSystemAgent } from "../utils/id-utils.js";
import type { ObjectStoreProvider } from "../core/store/object-store.types.js";
import type {
  CrowMcpServerConfig,
  McpServerDefinition,
  CrowMcpTransport,
  ConfigurableMcpMetadata,
} from "./crow-mcp-manager.types.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import type { SystemSettingsManager } from "../services/system-settings-manager.js";
import { FEED_MCP_SERVER_NAME } from "./feed/feed-mcp-server.js";

const log = logger.child({ context: "mcp-manager" });

/** Object store table name for MCP server configs */
export const MCP_CONFIG_STORE_TABLE = "mcp";

/**
 * MCP manager - registry for built-in MCP server definitions and
 * CRUD for user-configured external MCP servers persisted via object store.
 */
export class CrowMcpManager {
  /** Built-in MCP server definitions (registered programmatically at startup) */
  private mcpServers = new Map<string, McpServerDefinition>();
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

  /** Register a built-in MCP server definition. */
  public registerMcpServer(definition: McpServerDefinition): void {
    this.mcpServers.set(definition.name, definition);
    log.info(
      { name: definition.name, restricted: !!definition.allowedAgentIds, configurable: !!definition.isConfigurable },
      "MCP server registered"
    );
  }

  public deregisterMcpServer(name: string): void {
    this.mcpServers.delete(name);
    log.info({ name }, "MCP server de-registered");
  }

  /** Get MCP servers available to a specific agent */
  public async getMcpServersForAgent(agentId: string): Promise<CrowMcpServerConfig[]> {
    const agentConfig = this.registry.getAgent(agentId);
    const configuredMcpIds = new Set(agentConfig.mcpServerIds ?? []);
    const serverConfigMap = new Map<string, CrowMcpServerConfig>();

    const definitions = await this.getInternalServerDefinitionsForAgent(agentId, agentConfig);
    for (const definition of definitions) {
      const hasConnections = !definition.hasRequiredConnections || (await definition.hasRequiredConnections(agentId));
      if (!hasConnections) {
        continue;
      }

      if (definition.isConfigurable && !configuredMcpIds.has(definition.name)) {
        continue;
      }

      const connectionProfiles = definition.getConnectionProfiles
        ? await definition.getConnectionProfiles(agentId)
        : undefined;
      serverConfigMap.set(definition.name, {
        kind: "internal",
        name: definition.name,
        mcpToolPrefix: `mcp__${definition.name}__`,
        isAutoApproved: !definition.isConfigurable,
        tools: definition.getTools(agentId),
        connectionProfiles,
      });
    }

    if (!agentConfig.isBackgroundAgent) {
      const userMcpConfigs = this.getUserMcpConfigs().filter((config) => {
        return (isCrowSystemAgent(agentId) && config.enableForCrow) || configuredMcpIds.has(config.id);
      });
      for (const config of userMcpConfigs) {
        const name = this.normalizeMcpName(config.name);
        if (serverConfigMap.has(name)) {
          log.warn({ configId: config.id, name }, "User MCP config name collides with an internal server, skipping");
          continue;
        }

        serverConfigMap.set(name, {
          kind: "external",
          name,
          mcpToolPrefix: agentConfig.type === AGENT_TYPE.CLAUDE_CODE ? `mcp__${name}__` : `${name}-`,
          transport: this.toTransport(config),
        });
      }
    }

    return Array.from(serverConfigMap.values());
  }

  public getCompleteMcpToolName(serverName: string, toolName: string): string {
    return `mcp__${serverName}__${toolName}`;
  }

  public async getMcpConfigsForAgent(agentId: string): Promise<(McpServerConfig | InternalMcpConfig)[]> {
    const agentConfig = this.registry.getAgent(agentId);
    const definitions = await this.getInternalServerDefinitionsForAgent(agentId, agentConfig);
    const internalConfigs: InternalMcpConfig[] = [];
    for (const definition of definitions) {
      if (!definition.isConfigurable) {
        continue;
      }

      const hasConnections = !definition.hasRequiredConnections || (await definition.hasRequiredConnections(agentId));
      internalConfigs.push({
        type: MCP_CONFIG_TYPE.INTERNAL,
        id: definition.name,
        name: definition.name,
        displayName: definition.displayName,
        isDisabled: !hasConnections,
      });
    }

    return [...internalConfigs, ...this.getUserMcpConfigs()];
  }

  /** Get user-configured MCP server configs persisted to the object store */
  public getUserMcpConfigs(): McpServerConfig[] {
    return Array.from(this.mcpConfigs.values());
  }

  public getConfigurableMcpServers(): ConfigurableMcpMetadata[] {
    const configurableServers: ConfigurableMcpMetadata[] = [];
    for (const definition of this.mcpServers.values()) {
      if (definition.isConfigurable && !definition.hasRequiredConnections) {
        configurableServers.push({ id: definition.name, displayName: definition.displayName ?? definition.name });
      }
    }

    const userConfigs = this.getUserMcpConfigs().map((config) => ({
      id: config.id,
      displayName: config.displayName ?? config.name,
      description: config.description,
    }));

    return configurableServers.concat(userConfigs);
  }

  public getMcpServerDisplayName(id: string): string | undefined {
    const internal = this.mcpServers.get(id);
    if (internal) {
      return internal.displayName ?? internal.name;
    }

    const userConfig = this.mcpConfigs.get(id);
    return userConfig ? (userConfig.displayName ?? userConfig.name) : undefined;
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

  /** Map a persisted user MCP config to a Crow MCP transport. */
  private toTransport(config: McpServerConfig): CrowMcpTransport {
    if (config.type === MCP_CONFIG_TYPE.STDIO) {
      return { type: config.type, command: config.command, args: config.args, env: config.env };
    }

    return { type: config.type, url: config.url, headers: config.headers };
  }

  private async getInternalServerDefinitionsForAgent(
    agentId: string,
    agentConfig: AgentConfig
  ): Promise<McpServerDefinition[]> {
    const hasConfiguredFeedIds =
      agentId === CROW_SYSTEM_AGENT_ID
        ? (await this.systemSettingsManager.getSuperCrowSettings()).configuredFeeds.length > 0
        : !!agentConfig.configuredFeeds?.length;

    return Array.from(this.mcpServers.values()).filter(
      (definition) =>
        (!definition.allowedAgentIds || definition.allowedAgentIds.includes(agentId)) &&
        !definition.disallowedAgentIds?.includes(agentId) &&
        (definition.name !== FEED_MCP_SERVER_NAME || hasConfiguredFeedIds)
    );
  }
}
