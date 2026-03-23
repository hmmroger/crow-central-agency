/** WebSocket connection state */
export const WS_STATE = {
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  RECONNECTING: "reconnecting",
} as const;

export type WsState = (typeof WS_STATE)[keyof typeof WS_STATE];

/** Callback for incoming server messages */
export type WsMessageHandler = (data: unknown) => void;
