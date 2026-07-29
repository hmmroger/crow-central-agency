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
  behavior: "allow" | "deny" | "allow_always";
  message?: string;
  updatedInput?: Record<string, unknown>;
  toolUseID: string;
  /** Client-edited rules for an allow_always, preferred over the derived rules when present. */
  rules?: string[];
}
