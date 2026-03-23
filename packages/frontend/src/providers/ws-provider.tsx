import { createContext, useEffect, useRef, useState, type ReactNode } from "react";
import { WsClient, buildWsUrl } from "../services/ws-client.js";
import { WS_STATE, type WsState, type WsMessageHandler } from "../services/ws-client.types.js";

export interface WsContextValue {
  /** Send a message to the server */
  send: (message: Record<string, unknown>) => void;
  /** Subscribe to an agent's messages (persists across reconnects) */
  subscribe: (agentId: string) => void;
  /** Unsubscribe from an agent's messages */
  unsubscribe: (agentId: string) => void;
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
 */
export function WsProvider({ children }: WsProviderProps) {
  const clientRef = useRef<WsClient | undefined>(undefined);
  const [connectionState, setConnectionState] = useState<WsState>(WS_STATE.DISCONNECTED);

  useEffect(() => {
    const client = new WsClient(buildWsUrl());
    clientRef.current = client;

    client.onStateChange(setConnectionState);
    client.connect();

    return () => {
      client.disconnect();
      clientRef.current = undefined;
    };
  }, []);

  const contextValue: WsContextValue = {
    send: (message) => clientRef.current?.send(message),
    subscribe: (agentId) => clientRef.current?.subscribe(agentId),
    unsubscribe: (agentId) => clientRef.current?.unsubscribe(agentId),
    onMessage: (handler) => clientRef.current?.onMessage(handler) ?? (() => {}),
    connectionState,
  };

  return <WsContext value={contextValue}>{children}</WsContext>;
}
