import { useEffect, type RefObject } from "react";
import { AgentStatusWsMessageSchema } from "@crow-central-agency/shared";
import type Graph from "graphology";
import { useWs } from "../../hooks/use-ws.js";
import { STATUS_APPEARANCE } from "./graph-theme.js";
import type { GraphNodeAttributes, GraphEdgeAttributes } from "./graph-view.types.js";

/**
 * Subscribes to agent status WS events and updates graph node colors/sizes.
 * Single global listener — avoids N per-agent subscriptions.
 */
export function useGraphAgentStatus(graphRef: RefObject<Graph<GraphNodeAttributes, GraphEdgeAttributes>>) {
  const { onMessage } = useWs();

  useEffect(() => {
    const unregister = onMessage((raw) => {
      const parsed = AgentStatusWsMessageSchema.safeParse(raw);
      if (!parsed.success) {
        return;
      }

      const graph = graphRef.current;
      const { agentId, status } = parsed.data;
      if (!graph || !graph.hasNode(agentId)) {
        return;
      }

      // Don't override system agent color
      const isSystemAgent = graph.getNodeAttribute(agentId, "isSystemAgent");
      if (isSystemAgent) {
        return;
      }

      const { color, size } = STATUS_APPEARANCE[status];
      graph.setNodeAttribute(agentId, "color", color);
      graph.setNodeAttribute(agentId, "size", size);
      graph.setNodeAttribute(agentId, "agentStatus", status);
    });

    return unregister;
  }, [onMessage, graphRef]);
}
