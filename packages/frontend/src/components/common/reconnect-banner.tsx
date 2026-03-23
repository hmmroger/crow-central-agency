import { Wifi, WifiOff } from "lucide-react";
import { WS_STATE, type WsState } from "../../services/ws-client.types.js";

interface ReconnectBannerProps {
  connectionState: WsState;
}

/**
 * Banner shown when WebSocket connection is lost or reconnecting.
 * Hidden when connected.
 */
export function ReconnectBanner({ connectionState }: ReconnectBannerProps) {
  if (connectionState === WS_STATE.CONNECTED) {
    return null;
  }

  const isReconnecting = connectionState === WS_STATE.RECONNECTING;

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-warning/10 border-b border-warning/20 text-warning text-xs">
      {isReconnecting ? (
        <>
          <Wifi className="h-3 w-3 animate-pulse" />
          Reconnecting...
        </>
      ) : (
        <>
          <WifiOff className="h-3 w-3" />
          Disconnected
        </>
      )}
    </div>
  );
}
