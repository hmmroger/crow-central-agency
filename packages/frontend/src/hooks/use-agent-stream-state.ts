import { useCallback, useState } from "react";
import {
  AGENT_STATUS,
  AgentTextWsMessageSchema,
  AgentActivityWsMessageSchema,
  AgentResultWsMessageSchema,
  AgentStatusWsMessageSchema,
  AgentToolProgressWsMessageSchema,
  PermissionRequestWsMessageSchema,
  PermissionCancelledWsMessageSchema,
} from "@crow-central-agency/shared";
import { useWsSubscription } from "./use-ws-subscription.js";
import type { PendingPermissionRequest, QueryResult, ActiveToolUse } from "./agent-interaction.types.js";

/** Return type of useAgentStreamState */
export interface AgentStreamState {
  /** Currently streaming text — display-only buffer, not a message */
  streamingText: string;
  /** Currently executing tool — real-time indicator */
  activeToolUse: ActiveToolUse | undefined;
  /** Last query result (cost, duration) — displayed outside message list */
  lastResult: QueryResult | undefined;
  /** Pending permission requests awaiting user response */
  pendingPermissions: PendingPermissionRequest[];
  /** Remove a permission by toolUseId (for optimistic updates on allow/deny) */
  removePendingPermission: (toolUseId: string) => void;
}

/**
 * Ephemeral WS-driven state for agent streaming display.
 * Manages streamingText, activeToolUse, lastResult, and pendingPermissions —
 * all transient state with no REST endpoint and no cache value.
 *
 * @param agentId - The agent to subscribe to
 */
export function useAgentStreamState(agentId: string): AgentStreamState {
  const [streamingText, setStreamingText] = useState("");
  const [activeToolUse, setActiveToolUse] = useState<ActiveToolUse | undefined>();
  const [lastResult, setLastResult] = useState<QueryResult | undefined>();
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermissionRequest[]>([]);

  useWsSubscription(agentId, (data) => {
    const textParsed = AgentTextWsMessageSchema.safeParse(data);

    if (textParsed.success) {
      setStreamingText((prev) => prev + textParsed.data.text);

      return;
    }

    const activityParsed = AgentActivityWsMessageSchema.safeParse(data);

    if (activityParsed.success) {
      setActiveToolUse({
        toolName: activityParsed.data.toolName,
        description: activityParsed.data.description,
      });

      return;
    }

    const toolProgressParsed = AgentToolProgressWsMessageSchema.safeParse(data);

    if (toolProgressParsed.success) {
      setActiveToolUse((prev) =>
        prev
          ? { ...prev, elapsedTimeSeconds: toolProgressParsed.data.elapsedTimeSeconds }
          : {
              toolName: toolProgressParsed.data.toolName,
              description: "",
              elapsedTimeSeconds: toolProgressParsed.data.elapsedTimeSeconds,
            }
      );

      return;
    }

    const resultParsed = AgentResultWsMessageSchema.safeParse(data);

    if (resultParsed.success) {
      setLastResult({
        subtype: resultParsed.data.subtype,
        costUsd: resultParsed.data.totalCostUsd,
        durationMs: resultParsed.data.durationMs,
      });
      setStreamingText("");
      setActiveToolUse(undefined);

      return;
    }

    const statusParsed = AgentStatusWsMessageSchema.safeParse(data);

    if (statusParsed.success) {
      // Clear stale result banner when a new query starts
      if (statusParsed.data.status === AGENT_STATUS.STREAMING) {
        setLastResult(undefined);
      }

      // Clear streaming state when agent becomes idle or errors
      if (statusParsed.data.status === AGENT_STATUS.IDLE || statusParsed.data.status === AGENT_STATUS.ERROR) {
        setStreamingText("");
        setActiveToolUse(undefined);
      }

      return;
    }

    const permRequestParsed = PermissionRequestWsMessageSchema.safeParse(data);

    if (permRequestParsed.success) {
      setPendingPermissions((prev) => [
        ...prev,
        {
          toolUseId: permRequestParsed.data.toolUseId,
          toolName: permRequestParsed.data.toolName,
          input: permRequestParsed.data.input,
          decisionReason: permRequestParsed.data.decisionReason,
        },
      ]);

      return;
    }

    const permCancelledParsed = PermissionCancelledWsMessageSchema.safeParse(data);

    if (permCancelledParsed.success) {
      setPendingPermissions((prev) => prev.filter((perm) => perm.toolUseId !== permCancelledParsed.data.toolUseId));
    }
  });

  const removePendingPermission = useCallback((toolUseId: string) => {
    setPendingPermissions((prev) => prev.filter((perm) => perm.toolUseId !== toolUseId));
  }, []);

  return { streamingText, activeToolUse, lastResult, pendingPermissions, removePendingPermission };
}
