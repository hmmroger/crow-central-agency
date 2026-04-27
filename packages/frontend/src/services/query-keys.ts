/**
 * Query key factory for consistent key management.
 * Hierarchical structure enables scoped invalidation:
 *   queryClient.invalidateQueries({ queryKey: agentKeys.all })  → all agent queries
 *   queryClient.invalidateQueries({ queryKey: agentKeys.detail(id) })  → single agent + sub-resources
 */
export const agentKeys = {
  /** Root key for all agent-related queries */
  all: ["agents"] as const,
  /** Agent list */
  list: () => [...agentKeys.all, "list"] as const,
  /** Single agent detail */
  detail: (agentId: string) => [...agentKeys.all, "detail", agentId] as const,
  /** Messages for an agent session */
  messages: (agentId: string) => [...agentKeys.all, "detail", agentId, "messages"] as const,
  /** Agent runtime state (status, usage) */
  state: (agentId: string) => [...agentKeys.all, "detail", agentId, "state"] as const,
  /** Persisted real-time activities for an agent */
  activities: (agentId: string) => [...agentKeys.all, "detail", agentId, "activities"] as const,
  /** Artifacts for an agent */
  artifacts: (agentId: string) => [...agentKeys.all, "detail", agentId, "artifacts"] as const,
  /** Single artifact content */
  artifactContent: (entityType: string, entityId: string, filename: string) =>
    [...agentKeys.all, "detail", entityType, entityId, "artifacts", filename] as const,
  /** Circle artifacts accessible to an agent */
  circleArtifacts: (agentId: string) => [...agentKeys.all, "detail", agentId, "circle-artifacts"] as const,
  /** Circles that an agent is a direct member of */
  circles: (agentId: string) => [...agentKeys.all, "detail", agentId, "circles"] as const,
};

/**
 * Query key factory for agent config templates.
 * Templates are global (not scoped per agent).
 */
export const agentTemplateKeys = {
  /** Root key for all agent template queries */
  all: ["agent-templates"] as const,
  /** Template list */
  list: () => [...agentTemplateKeys.all, "list"] as const,
};

/**
 * Query key factory for task-related queries.
 * Tasks are global (not scoped per agent), so the hierarchy is flat.
 */
export const taskKeys = {
  /** Root key for all task-related queries */
  all: ["tasks"] as const,
  /** Task list */
  list: () => [...taskKeys.all, "list"] as const,
};

/**
 * Query key factory for sensor queries.
 */
export const sensorKeys = {
  /** Root key for all sensor queries */
  all: ["sensors"] as const,
  /** Sensor list */
  list: () => [...sensorKeys.all, "list"] as const,
};

/**
 * Query key factory for circle queries.
 */
export const circleKeys = {
  /** Root key for all circle queries */
  all: ["circles"] as const,
  /** Circle list */
  list: () => [...circleKeys.all, "list"] as const,
  /** Members of a specific circle */
  members: (circleId: string) => [...circleKeys.all, "members", circleId] as const,
};

/**
 * Query key factory for relationship queries.
 */
export const relationshipKeys = {
  /** Root key for all relationship queries */
  all: ["relationships"] as const,
  /** Relationship list */
  list: () => [...relationshipKeys.all, "list"] as const,
};

/**
 * Query key factory for graph queries.
 */
export const graphKeys = {
  /** Root key for all graph queries */
  all: ["graph"] as const,
  /** Graph data */
  data: () => [...graphKeys.all, "data"] as const,
};

/**
 * Query key factory for feed queries.
 */
export const feedKeys = {
  /** Root key for all feed queries */
  all: ["feeds"] as const,
  /** Feed list */
  list: () => [...feedKeys.all, "list"] as const,
};

/**
 * Query key factory for system-settings queries.
 * Keyed per namespace (e.g. "super-crow", "dashboard") so each bucket
 * shares the root but invalidates independently.
 */
export const systemSettingsKeys = {
  all: ["system-settings"] as const,
  superCrow: () => [...systemSettingsKeys.all, "super-crow"] as const,
  dashboard: () => [...systemSettingsKeys.all, "dashboard"] as const,
};

/**
 * Query key factory for system-level queries (capabilities, etc.).
 */
export const systemKeys = {
  all: ["system"] as const,
  capabilities: () => [...systemKeys.all, "capabilities"] as const,
};

/**
 * Query key factory for MCP config queries.
 */
export const mcpConfigKeys = {
  /** Root key for all MCP config queries */
  all: ["mcpConfigs"] as const,
  /** MCP config list */
  list: () => [...mcpConfigKeys.all, "list"] as const,
  /** Single MCP config detail */
  detail: (configId: string) => [...mcpConfigKeys.all, "detail", configId] as const,
};
