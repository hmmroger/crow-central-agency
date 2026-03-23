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
