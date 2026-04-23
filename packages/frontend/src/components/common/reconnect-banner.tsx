import { Wifi, WifiOff } from "lucide-react";
import { WS_STATE } from "../../services/ws-client.types.js";
import { useWs } from "../../hooks/use-ws.js";

/**
 * Banner shown when WebSocket connection is lost or reconnecting.
 * Hidden when connected. Delays appearance to avoid flash on initial load.
 */
export function ReconnectBanner() {
  const { connectionState } = useWs();

  const isShowable = connectionState === WS_STATE.DISCONNECTED || connectionState === WS_STATE.RECONNECTING;
  if (!isShowable) {
    return null;
  }

  const isReconnecting = connectionState === WS_STATE.RECONNECTING;
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-warning/10 border-b border-warning/20 text-warning text-xs animate-fade-slide-down">
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
