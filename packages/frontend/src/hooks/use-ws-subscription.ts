import { useEffect, useRef } from "react";
import { useWs } from "./use-ws.js";

/**
 * Subscribe to an agent's WS messages. Automatically subscribes on mount
 * and unsubscribes on unmount. Routes matching messages to the callback.
 *
 * @param agentId - The agent to subscribe to (pass undefined to skip)
 * @param onMessage - Callback for incoming messages for this agent
 */
export function useWsSubscription(
  agentId: string | undefined,
  onMessage: (data: { type: string; agentId?: string; [key: string]: unknown }) => void
): void {
  const { subscribe, unsubscribe, onMessage: registerHandler } = useWs();

  // Stabilize the callback reference so the effect only re-runs when agentId changes
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!agentId) {
      return;
    }

    subscribe(agentId);

    const unregister = registerHandler((raw) => {
      const message = raw as { type?: string; agentId?: string };

      if (message.agentId === agentId) {
        onMessageRef.current(message as { type: string; agentId: string; [key: string]: unknown });
      }
    });

    return () => {
      unsubscribe(agentId);
      unregister();
    };
  }, [agentId, subscribe, unsubscribe, registerHandler]);
}
