import {
  ENTITY_TYPE,
  RELATIONSHIP_TYPE,
  applyAgentOrder,
  type AgentCircle,
  type AgentConfig,
  type Relationship,
} from "@crow-central-agency/shared";

/**
 * Sort circles by their displayOrder (dashboard ordering), falling back
 * to alphabetical name when displayOrder is missing or equal.
 */
export function sortCirclesByDisplayOrder(circles: AgentCircle[]): AgentCircle[] {
  return [...circles].sort((circleA, circleB) => {
    const orderA = circleA.displayOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = circleB.displayOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return circleA.name.localeCompare(circleB.name);
  });
}

/**
 * Group non-system agents into their circles using relationship data.
 * An agent may appear in multiple circles.
 */
export function groupAgentsByCircle(
  agents: AgentConfig[],
  circles: AgentCircle[],
  relationships: Relationship[]
): Map<string, AgentConfig[]> {
  const agentToCircles = new Map<string, Set<string>>();
  for (const relationship of relationships) {
    if (
      relationship.relationshipType === RELATIONSHIP_TYPE.MEMBERSHIP &&
      relationship.sourceEntityType === ENTITY_TYPE.AGENT_CIRCLE &&
      relationship.targetEntityType === ENTITY_TYPE.AGENT
    ) {
      const circleId = relationship.sourceEntityId;
      const agentId = relationship.targetEntityId;
      const existing = agentToCircles.get(agentId);
      if (existing) {
        existing.add(circleId);
      } else {
        agentToCircles.set(agentId, new Set([circleId]));
      }
    }
  }

  const groups = new Map<string, AgentConfig[]>();
  for (const circle of circles) {
    groups.set(circle.id, []);
  }

  for (const agent of agents) {
    if (agent.isSystemAgent) {
      continue;
    }

    const circleIds = agentToCircles.get(agent.id);
    if (circleIds && circleIds.size > 0) {
      for (const circleId of circleIds) {
        groups.get(circleId)?.push(agent);
      }
    }
  }

  return groups;
}

/**
 * Flatten agents into a single ordered list matching the dashboard layout:
 * pinned agents first (in saved pinned order), then circles in displayOrder
 * with the saved per-circle order applied within each circle. Each agent
 * appears once, placed in its first matching group. Agents not pinned and
 * not in any circle (including system agents) are appended at the end in
 * their original order.
 */
export function flattenAgentsByCircleOrder(
  agents: AgentConfig[],
  circles: AgentCircle[],
  relationships: Relationship[],
  circleAgentOrder: Record<string, string[]> | undefined,
  pinnedAgentOrder: string[] | undefined
): AgentConfig[] {
  const sortedCircles = sortCirclesByDisplayOrder(circles);
  const grouped = groupAgentsByCircle(agents, circles, relationships);

  const placed = new Set<string>();
  const result: AgentConfig[] = [];

  const pinnedAgents = applyAgentOrder(
    agents.filter((agent) => agent.isPinned),
    pinnedAgentOrder
  );
  for (const agent of pinnedAgents) {
    result.push(agent);
    placed.add(agent.id);
  }

  for (const circle of sortedCircles) {
    const circleAgents = (grouped.get(circle.id) ?? []).filter((agent) => !placed.has(agent.id));
    const ordered = applyAgentOrder(circleAgents, circleAgentOrder?.[circle.id]);
    for (const agent of ordered) {
      result.push(agent);
      placed.add(agent.id);
    }
  }

  for (const agent of agents) {
    if (!placed.has(agent.id)) {
      result.push(agent);
    }
  }

  return result;
}
