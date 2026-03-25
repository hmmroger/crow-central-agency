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
  /** Artifacts for an agent */
  artifacts: (agentId: string) => [...agentKeys.all, "detail", agentId, "artifacts"] as const,
  /** Single artifact content */
  artifactContent: (agentId: string, filename: string) =>
    [...agentKeys.all, "detail", agentId, "artifacts", filename] as const,
};
