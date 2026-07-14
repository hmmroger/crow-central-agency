import type { FragmentManager } from "../../services/fragment/fragment-manager.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";

/**
 * Tool-side authorization: reject any fragment the acting agent cannot reach.
 * Out-of-scope access reports FRAGMENT_NOT_FOUND so existence never leaks.
 */
export function assertFragmentAccessible(fragmentManager: FragmentManager, agentId: string, fragmentId: string): void {
  if (!fragmentManager.isFragmentAccessible(agentId, fragmentId)) {
    throw new AppError(`Fragment not found: ${fragmentId}`, APP_ERROR_CODES.FRAGMENT_NOT_FOUND);
  }
}
