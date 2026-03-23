import { useContext } from "react";
import { WsContext, type WsContextValue } from "../providers/ws-provider.js";

/**
 * Access the WebSocket context (send, subscribe, unsubscribe, onMessage, connectionState).
 * Must be used within a WsProvider.
 */
export function useWs(): WsContextValue {
  const context = useContext(WsContext);

  if (!context) {
    throw new Error("useWs must be used within a WsProvider");
  }

  return context;
}
