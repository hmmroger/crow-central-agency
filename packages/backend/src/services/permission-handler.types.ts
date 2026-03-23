import type { EventMap } from "../event-bus/event-bus.types.js";

/** A pending permission request awaiting user response */
export interface PendingPermission {
  agentId: string;
  toolName: string;
  toolUseId: string;
  resolve: (result: PermissionResult) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/** Result of a permission decision */
export interface PermissionResult {
  behavior: "allow" | "deny";
  message?: string;
  updatedInput?: Record<string, unknown>;
  toolUseID: string;
}

/** Events emitted by the PermissionHandler */
export interface PermissionHandlerEvents extends EventMap {
  permissionRequest: {
    agentId: string;
    toolUseId: string;
    toolName: string;
    input: Record<string, unknown>;
    decisionReason?: string;
  };
  permissionCancelled: {
    agentId: string;
    toolUseId: string;
  };
}
