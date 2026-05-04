import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import {
  ENTITY_TYPE,
  RELATIONSHIP_TYPE,
  applyAgentOrder,
  type AgentConfig,
  type AgentCircle,
  type AgentTaskItem,
  type Relationship,
} from "@crow-central-agency/shared";
import { useAgentsContext } from "../../providers/agents-provider.js";
import { useCirclesQuery } from "../../hooks/queries/use-circles-query.js";
import { useUpdateCircle } from "../../hooks/queries/use-circle-mutations.js";
import { useDashboardSettingsQuery, useUpdateDashboardSettings } from "../../hooks/queries/use-dashboard-settings.js";
import { useRelationshipsQuery } from "../../hooks/queries/use-relationships-query.js";
import { useTasksContext } from "../../providers/tasks-provider.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { EmptyState } from "../common/empty-state.js";
import { TaskStatsPanel } from "./task-stats-panel.js";
import { CircleSection } from "./circle/circle-section.js";
import { PinnedSection } from "./pinned-section.js";
import { DashboardActions } from "./dashboard-actions.js";
import { MiniGraph } from "./mini-graph.js";
import { TasksWidget } from "./tasks-widget.js";
import { useAppStore } from "../../stores/app-store.js";

/**
 * Viewport-driven layout tiers for the dashboard top overview.
 */
const TOP_LAYOUT = {
  ACTIONS_ONLY: "actions-only",
  COMPACT: "compact",
  THREE_WIDGET: "three-widget",
  FULL: "full",
} as const;
type TopLayout = (typeof TOP_LAYOUT)[keyof typeof TOP_LAYOUT];

const MD_QUERY = "(min-width: 768px)";
const LG_QUERY = "(min-width: 1024px)";
const XL_QUERY = "(min-width: 1280px)";

/**
 * Dashboard - task stats, actions, and agent cards grouped by circle.
 */
export function Dashboard() {
  const { agents, isLoading: agentsLoading, error: agentsError, refetch } = useAgentsContext();
  const { data: circles = [], isLoading: circlesLoading, error: circlesError } = useCirclesQuery();
  const { data: relationships = [] } = useRelationshipsQuery();
  const { data: dashboardSettings } = useDashboardSettingsQuery();
  const { tasks } = useTasksContext();

  const updateCircle = useUpdateCircle();
  const updateDashboardSettings = useUpdateDashboardSettings();
  const collapsedCircles = useAppStore((state) => state.collapsedCircles);
  const toggleCircle = useAppStore((state) => state.toggleCircleCollapsed);
  const topCollapsed = useAppStore((state) => state.dashboardTopCollapsed);
  const toggleTopCollapsed = useAppStore((state) => state.toggleDashboardTopCollapsed);

  const viewportTier = useSyncExternalStore(subscribeToTopLayoutQueries, getTopLayoutTier);
  const topLayout: TopLayout =
    viewportTier === TOP_LAYOUT.ACTIONS_ONLY
      ? TOP_LAYOUT.ACTIONS_ONLY
      : viewportTier === TOP_LAYOUT.COMPACT || topCollapsed
        ? TOP_LAYOUT.COMPACT
        : viewportTier;

  const pinnedAgents = useMemo(() => {
    const filtered = agents.filter((agent) => agent.isPinned);
    return applyAgentOrder(filtered, dashboardSettings?.pinnedAgentOrder);
  }, [agents, dashboardSettings?.pinnedAgentOrder]);

  const agentsByCircle = useMemo(
    () => groupAgentsByCircle(agents, circles, relationships),
    [agents, circles, relationships]
  );

  // Sort circles by displayOrder, then alphabetically by name
  const sortedCircles = useMemo(() => {
    return [...circles].sort((circleA, circleB) => {
      const orderA = circleA.displayOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = circleB.displayOrder ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return circleA.name.localeCompare(circleB.name);
    });
  }, [circles]);

  const handleReorderCircle = useCallback(
    (circleId: string, orderedAgentIds: string[]) => {
      updateDashboardSettings.mutate({
        circleAgentOrder: { [circleId]: orderedAgentIds },
      });
    },
    [updateDashboardSettings]
  );

  const handleReorderPinned = useCallback(
    (orderedAgentIds: string[]) => {
      updateDashboardSettings.mutate({ pinnedAgentOrder: orderedAgentIds });
    },
    [updateDashboardSettings]
  );

  /** Swap displayOrder between two adjacent circles, normalizing all orders first */
  const handleMoveCircle = useCallback(
    (circleId: string, direction: "up" | "down") => {
      const index = sortedCircles.findIndex((circle) => circle.id === circleId);
      if (index < 0) {
        return;
      }

      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= sortedCircles.length) {
        return;
      }

      // Normalize all circles to sequential orders based on current sort position,
      // then swap the two targets. This prevents duplicates and gaps.
      for (let position = 0; position < sortedCircles.length; position++) {
        const circle = sortedCircles[position];
        const targetOrder = position === index ? swapIndex : position === swapIndex ? index : position;
        if (circle.displayOrder !== targetOrder) {
          updateCircle.mutate({ circleId: circle.id, input: { displayOrder: targetOrder } });
        }
      }
    },
    [sortedCircles, updateCircle]
  );

  const loading = agentsLoading || circlesLoading;

  if (loading) {
    return (
      <>
        <HeaderPortal title="Dashboard" />
      </>
    );
  }

  const fetchError = agentsError ?? circlesError;
  if (fetchError) {
    return (
      <>
        <HeaderPortal title="Dashboard" />
        <div className="h-full flex flex-col items-center justify-center gap-4 text-text-muted">
          <p className="text-lg text-error">{fetchError.message}</p>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-elevated text-text-base text-sm font-medium hover:opacity-90 transition-opacity"
            onClick={refetch}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </>
    );
  }

  if (agents.length === 0) {
    return (
      <>
        <HeaderPortal title="Dashboard" />
        <div className="px-6 pt-5 flex gap-6 items-start">
          <TaskStatsPanel tasks={tasks} className="flex-1" />
          <DashboardActions className="shrink-0 ml-auto" />
        </div>
        <EmptyState message="No agents yet" description="Create your first agent to get started." />
      </>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <HeaderPortal title="Dashboard" />

      {/* Top section: layout adapts to viewport tier; user toggle (lg+) drops to COMPACT. */}
      <div
        className={
          topLayout === TOP_LAYOUT.THREE_WIDGET || topLayout === TOP_LAYOUT.FULL
            ? "relative flex gap-6 items-start px-4 py-3 bg-surface/25 border-b border-border-subtle/75"
            : "relative flex gap-4 items-center px-4 py-3 bg-surface/25 border-b border-border-subtle/75"
        }
      >
        {renderTopSection(topLayout, tasks)}

        {/* Toggle is only available at lg+; below lg the overview is force-collapsed. */}
        <button
          type="button"
          onClick={toggleTopCollapsed}
          aria-label={topCollapsed ? "Expand dashboard overview" : "Collapse dashboard overview"}
          title={topCollapsed ? "Expand" : "Collapse"}
          className="hidden absolute left-1/2 -translate-x-1/2 -bottom-2 z-10 lg:flex items-center justify-center h-4 w-12 rounded-full bg-surface-elevated/75 border border-border-subtle/75 text-text-muted hover:text-text-base hover:bg-surface-elevated hover:border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {topCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Pinned agents + circle sections */}
      <div className="flex-1 overflow-y-auto">
        <PinnedSection agents={pinnedAgents} onReorder={handleReorderPinned} />

        {sortedCircles.map((circle, index) => {
          const circleAgents = agentsByCircle.get(circle.id) ?? [];
          const orderedAgents = applyAgentOrder(circleAgents, dashboardSettings?.circleAgentOrder?.[circle.id]);

          return (
            <CircleSection
              key={circle.id}
              circle={circle}
              agents={orderedAgents}
              collapsed={collapsedCircles[circle.id] ?? false}
              onToggle={toggleCircle}
              canMoveUp={index > 0}
              canMoveDown={index < sortedCircles.length - 1}
              onMove={handleMoveCircle}
              onReorder={handleReorderCircle}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Pick which widgets to render in the dashboard top section based on layout tier.
 * Each tier owns a distinct subtree so unused widgets (notably MiniGraph -> Cytoscape)
 * never mount on small viewports.
 */
function renderTopSection(layout: TopLayout, tasks: AgentTaskItem[]): ReactNode {
  switch (layout) {
    case TOP_LAYOUT.ACTIONS_ONLY:
      return <DashboardActions compact className="ml-auto" />;
    case TOP_LAYOUT.COMPACT:
      return (
        <>
          <TaskStatsPanel tasks={tasks} compact />
          <DashboardActions compact className="ml-auto" />
        </>
      );
    case TOP_LAYOUT.THREE_WIDGET:
      return (
        <>
          <TaskStatsPanel tasks={tasks} className="min-w-xs max-w-md" />
          <MiniGraph className="min-w-xs" />
          <DashboardActions className="shrink-0 ml-auto" />
        </>
      );
    case TOP_LAYOUT.FULL:
      return (
        <>
          <TaskStatsPanel tasks={tasks} className="min-w-xs max-w-md" />
          <TasksWidget tasks={tasks} className="min-w-xs max-w-lg" />
          <MiniGraph className="min-w-xs" />
          <DashboardActions className="shrink-0 ml-auto" />
        </>
      );
  }
}

/**
 * Group agents by circle using relationship data.
 */
function groupAgentsByCircle(
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

  // Initialize groups for all circles
  const groups = new Map<string, AgentConfig[]>();
  for (const circle of circles) {
    groups.set(circle.id, []);
  }

  // Place agents into their circles
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

const subscribeToTopLayoutQueries = (notify: () => void) => {
  const queries = [window.matchMedia(MD_QUERY), window.matchMedia(LG_QUERY), window.matchMedia(XL_QUERY)];
  queries.forEach((mql) => mql.addEventListener("change", notify));

  return () => queries.forEach((mql) => mql.removeEventListener("change", notify));
};

const getTopLayoutTier = (): TopLayout => {
  if (window.matchMedia(XL_QUERY).matches) {
    return TOP_LAYOUT.FULL;
  }

  if (window.matchMedia(LG_QUERY).matches) {
    return TOP_LAYOUT.THREE_WIDGET;
  }

  return TOP_LAYOUT.ACTIONS_ONLY;
};
