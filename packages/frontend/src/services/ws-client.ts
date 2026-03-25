import { WS_STATE, type WsState, type WsMessageHandler } from "./ws-client.types.js";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

/**
 * WebSocket client with auto-reconnect and subscription management.
 * Maintains subscriptions across reconnects.
 */
export class WsClient {
  private ws: WebSocket | undefined;
  private state: WsState = WS_STATE.DISCONNECTED;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private subscriptions = new Set<string>();
  private messageHandlers = new Set<WsMessageHandler>();
  private stateChangeHandlers = new Set<(state: WsState) => void>();
  private intentionalDisconnect = false;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  /** Connect to the WebSocket server */
  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.setState(this.reconnectAttempt > 0 ? WS_STATE.RECONNECTING : WS_STATE.CONNECTING);

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.setState(WS_STATE.CONNECTED);
      this.resubscribeAll();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);

        for (const handler of this.messageHandlers) {
          handler(data);
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    this.ws.onclose = () => {
      this.setState(WS_STATE.DISCONNECTED);

      if (!this.intentionalDisconnect) {
        this.scheduleReconnect();
      }

      this.intentionalDisconnect = false;
    };

    this.ws.onerror = () => {
      // close event will follow, which handles reconnect
    };
  }

  /** Disconnect and stop reconnecting */
  public disconnect(): void {
    this.intentionalDisconnect = true;
    this.clearReconnectTimer();
    this.ws?.close();
    this.ws = undefined;
    this.setState(WS_STATE.DISCONNECTED);
    // intentionalDisconnect is cleared in onclose handler, not here
  }

  /** Send a typed message to the server */
  public send(message: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /** Subscribe to an agent's messages */
  public subscribe(agentId: string): void {
    this.subscriptions.add(agentId);
    this.send({ type: "subscribe", agentId });
  }

  /** Unsubscribe from an agent's messages */
  public unsubscribe(agentId: string): void {
    this.subscriptions.delete(agentId);
    this.send({ type: "unsubscribe", agentId });
  }

  /** Register a handler for incoming messages */
  public onMessage(handler: WsMessageHandler): () => void {
    this.messageHandlers.add(handler);

    return () => this.messageHandlers.delete(handler);
  }

  /** Register a handler for connection state changes */
  public onStateChange(handler: (state: WsState) => void): () => void {
    this.stateChangeHandlers.add(handler);

    return () => this.stateChangeHandlers.delete(handler);
  }

  /** Get the current connection state */
  public getState(): WsState {
    return this.state;
  }

  /** Re-subscribe all tracked subscriptions after reconnect */
  private resubscribeAll(): void {
    for (const agentId of this.subscriptions) {
      this.send({ type: "subscribe", agentId });
    }
  }

  /** Schedule a reconnect with exponential backoff */
  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt), RECONNECT_MAX_MS);
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private setState(newState: WsState): void {
    this.state = newState;

    for (const handler of this.stateChangeHandlers) {
      handler(newState);
    }
  }
}

/** Build the WebSocket URL based on the current page location */
export function buildWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  return `${protocol}//${window.location.host}/ws`;
}
