import { Wifi, WifiOff } from "lucide-react";
import { useWs } from "../../hooks/use-ws.js";
import { WS_STATE, type WsState } from "../../services/ws-client.types.js";
import { cn } from "../../utils/cn.js";

interface StatusPresentation {
  Icon: typeof Wifi;
  label: string;
  toneClass: string;
  pulse: boolean;
}

const STATUS_PRESENTATION: Record<WsState, StatusPresentation> = {
  [WS_STATE.NONE]: { Icon: Wifi, label: "Connecting...", toneClass: "text-text-muted", pulse: true },
  [WS_STATE.CONNECTING]: { Icon: Wifi, label: "Connecting...", toneClass: "text-warning", pulse: true },
  [WS_STATE.CONNECTED]: { Icon: Wifi, label: "Connected", toneClass: "text-success", pulse: false },
  [WS_STATE.RECONNECTING]: { Icon: Wifi, label: "Reconnecting...", toneClass: "text-warning", pulse: true },
  [WS_STATE.DISCONNECTED]: { Icon: WifiOff, label: "Disconnected", toneClass: "text-error", pulse: false },
};

/**
 * Compact icon-only WebSocket status indicator for the app header.
 * Hover/long-press surfaces the full state via the native title tooltip.
 */
export function ConnectionStatus() {
  const { connectionState } = useWs();
  const { Icon, label, toneClass, pulse } = STATUS_PRESENTATION[connectionState];

  return (
    <span
      role="status"
      aria-label={`Connection status: ${label}`}
      title={label}
      className={cn("inline-flex items-center justify-center h-5 w-5", toneClass)}
    >
      <Icon className={cn("h-4 w-4", pulse && "animate-pulse")} />
    </span>
  );
}
