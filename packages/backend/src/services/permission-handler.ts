import type { PendingPermission, PermissionResult } from "./permission-handler.types.js";
import type { WsBroadcaster } from "./ws-broadcaster.js";
import { PERMISSION_TIMEOUT_MS } from "../config/constants.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "permission-handler" });

/**
 * Manages tool permission requests with configurable timeout.
 * Bridges the SDK's canUseTool callback with WS-based user responses.
 * Takes WsBroadcaster as a direct dependency — broadcasting is intrinsic to this service.
 */
export class PermissionHandler {
  private pending = new Map<string, PendingPermission>();

  constructor(private readonly broadcaster: WsBroadcaster) {}

  /**
   * Request permission for a tool use. Broadcasts a permission_request to WS
   * subscribers and returns a promise that resolves when the user responds
   * or times out (auto-deny after 2 minutes).
   */
  public async requestPermission(
    agentId: string,
    toolName: string,
    input: Record<string, unknown>,
    toolUseId: string,
    decisionReason?: string
  ): Promise<PermissionResult> {
    return new Promise<PermissionResult>((resolve) => {
      // Set timeout — auto-deny after PERMISSION_TIMEOUT_MS
      const timeout = setTimeout(() => {
        this.cancelPermission(toolUseId, "Timed out waiting for permission response");
      }, PERMISSION_TIMEOUT_MS);

      // Store pending request
      const pendingRequest: PendingPermission = {
        agentId,
        toolName,
        toolUseId,
        resolve,
        timeout,
      };

      this.pending.set(toolUseId, pendingRequest);

      // Broadcast request directly to WS subscribers
      this.broadcaster.broadcast(agentId, {
        type: "permission_request",
        agentId,
        toolUseId,
        toolName,
        input,
        decisionReason,
      });

      log.info({ agentId, toolName, toolUseId }, "Permission requested");
    });
  }

  /**
   * Resolve a pending permission request with a user decision.
   * Called when a permission_response WS message is received.
   */
  public resolvePermission(toolUseId: string, behavior: "allow" | "deny", message?: string): void {
    const pendingRequest = this.pending.get(toolUseId);

    if (!pendingRequest) {
      log.warn({ toolUseId }, "No pending permission request found");

      return;
    }

    clearTimeout(pendingRequest.timeout);
    this.pending.delete(toolUseId);

    pendingRequest.resolve({
      behavior,
      message,
      toolUseID: toolUseId,
    });

    log.info({ toolUseId, behavior, agentId: pendingRequest.agentId }, "Permission resolved");
  }

  /**
   * Cancel a pending permission request (on timeout or agent stop).
   * Auto-denies with a reason message.
   */
  public cancelPermission(toolUseId: string, reason: string): void {
    const pendingRequest = this.pending.get(toolUseId);

    if (!pendingRequest) {
      return;
    }

    clearTimeout(pendingRequest.timeout);
    this.pending.delete(toolUseId);

    // Broadcast cancellation directly to WS subscribers
    this.broadcaster.broadcast(pendingRequest.agentId, {
      type: "permission_cancelled",
      agentId: pendingRequest.agentId,
      toolUseId,
    });

    // Resolve as deny
    pendingRequest.resolve({
      behavior: "deny",
      message: reason,
      toolUseID: toolUseId,
    });

    log.info({ toolUseId, reason, agentId: pendingRequest.agentId }, "Permission cancelled");
  }

  /** Cancel all pending permissions for an agent (on stop/cleanup) */
  public cancelAllForAgent(agentId: string): void {
    for (const [toolUseId, pendingRequest] of this.pending) {
      if (pendingRequest.agentId === agentId) {
        this.cancelPermission(toolUseId, "Agent stopped");
      }
    }
  }

  /** Check if there are any pending permissions for an agent */
  public hasPendingForAgent(agentId: string): boolean {
    for (const pendingRequest of this.pending.values()) {
      if (pendingRequest.agentId === agentId) {
        return true;
      }
    }

    return false;
  }
}
