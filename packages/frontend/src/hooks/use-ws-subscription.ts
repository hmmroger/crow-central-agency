import { useEffect, useRef } from "react";
import { useWs } from "./use-ws.js";

/**
 * Register a client-side handler for an agent's WS messages.
 * Filters incoming messages by agentId and routes matches to the callback.
 * No server-side subscribe/unsubscribe - server broadcasts all messages to connected clients.
 *
 * @param agentId - The agent to filter for (pass undefined to skip)
 * @param onMessage - Callback for incoming messages matching this agent
 */
export function useWsSubscription(
  agentId: string | undefined,
  onMessage: (data: { type: string; agentId?: string; [key: string]: unknown }) => void
): void {
  const { onMessage: registerHandler } = useWs();

  // Stabilize the callback reference so the effect only re-runs when agentId changes
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!agentId) {
      return;
    }

    const unregister = registerHandler((raw) => {
      const message = raw as { type?: string; agentId?: string };

      if (message.agentId === agentId) {
        onMessageRef.current(message as { type: string; agentId: string; [key: string]: unknown });
      }
    });

    return unregister;
  }, [agentId, registerHandler]);
}
