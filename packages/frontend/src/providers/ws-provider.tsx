import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WsClient, buildWsUrl } from "../services/ws-client.js";
import { WS_STATE, type WsState, type WsMessageHandler } from "../services/ws-client.types.js";

export interface WsContextValue {
  /** Send a message to the server */
  send: (message: Record<string, unknown>) => void;
  /** Register a handler for incoming messages. Returns cleanup function. */
  onMessage: (handler: WsMessageHandler) => () => void;
  /** Current connection state */
  connectionState: WsState;
}

export const WsContext = createContext<WsContextValue | undefined>(undefined);

interface WsProviderProps {
  children: ReactNode;
}

/**
 * WebSocket provider — manages WsClient lifecycle.
 * Connects on mount, disconnects on unmount.
 * No subscription management — server broadcasts all messages to connected clients.
 */
export function WsProvider({ children }: WsProviderProps) {
  const clientRef = useRef<WsClient | undefined>(undefined);
  const [connectionState, setConnectionState] = useState<WsState>(WS_STATE.DISCONNECTED);

  useEffect(() => {
    const client = new WsClient(buildWsUrl());
    clientRef.current = client;

    const cleanupStateChange = client.onStateChange(setConnectionState);
    client.connect();

    return () => {
      cleanupStateChange();
      client.disconnect();
      clientRef.current = undefined;
    };
  }, []);

  // Stable function references — only connectionState changes trigger context update
  const send = useCallback((message: Record<string, unknown>) => clientRef.current?.send(message), []);
  const onMessage = useCallback((handler: WsMessageHandler) => clientRef.current?.onMessage(handler) ?? (() => {}), []);

  const contextValue = useMemo<WsContextValue>(
    () => ({ send, onMessage, connectionState }),
    [send, onMessage, connectionState]
  );

  return <WsContext value={contextValue}>{children}</WsContext>;
}
