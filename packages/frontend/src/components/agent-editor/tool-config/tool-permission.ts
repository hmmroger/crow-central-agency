/** Per-rule permission disposition derived from the auto-approved / disallowed arrays. */
export const TOOL_DISPOSITION = {
  ASK: "ask",
  APPROVE: "approve",
  DENY: "deny",
} as const;

export type ToolDisposition = (typeof TOOL_DISPOSITION)[keyof typeof TOOL_DISPOSITION];

/** Ask is unrepresentable: a custom row exists only by being in one of the two arrays. */
export type CustomRuleDisposition = typeof TOOL_DISPOSITION.APPROVE | typeof TOOL_DISPOSITION.DENY;

/** The paired auto-approved / disallowed rule arrays backing the permission model. */
export interface ToolPermissions {
  autoApprovedTools: string[];
  disallowedTools: string[];
}

/**
 * Resolve a rule's disposition from the backing arrays. Deny takes precedence so a legacy record
 * with the same string in both arrays reads as Deny (and self-heals on the next toggle).
 */
export function dispositionForRule(
  rule: string,
  autoApprovedTools: string[],
  disallowedTools: string[]
): ToolDisposition {
  if (disallowedTools.includes(rule)) {
    return TOOL_DISPOSITION.DENY;
  }

  if (autoApprovedTools.includes(rule)) {
    return TOOL_DISPOSITION.APPROVE;
  }

  return TOOL_DISPOSITION.ASK;
}

/**
 * Set a rule's disposition, enforcing mutual exclusivity: Approve lands it in auto-approved only,
 * Deny in disallowed only, Ask in neither. Returns the original arrays unchanged for an empty rule.
 */
export function applyPermission(
  autoApprovedTools: string[],
  disallowedTools: string[],
  rule: string,
  disposition: ToolDisposition
): ToolPermissions {
  if (!rule) {
    return { autoApprovedTools, disallowedTools };
  }

  const nextAutoApproved = autoApprovedTools.filter((tool) => tool !== rule);
  const nextDisallowed = disallowedTools.filter((tool) => tool !== rule);

  if (disposition === TOOL_DISPOSITION.APPROVE) {
    nextAutoApproved.push(rule);
  } else if (disposition === TOOL_DISPOSITION.DENY) {
    nextDisallowed.push(rule);
  }

  return { autoApprovedTools: nextAutoApproved, disallowedTools: nextDisallowed };
}

/** A rule already present under either disposition is left untouched, never re-dispositioned. */
export function addCustomPermission(
  autoApprovedTools: string[],
  disallowedTools: string[],
  rule: string,
  disposition: CustomRuleDisposition
): ToolPermissions {
  if (!rule || autoApprovedTools.includes(rule) || disallowedTools.includes(rule)) {
    return { autoApprovedTools, disallowedTools };
  }

  if (disposition === TOOL_DISPOSITION.DENY) {
    return { autoApprovedTools, disallowedTools: [...disallowedTools, rule] };
  }

  return { autoApprovedTools: [...autoApprovedTools, rule], disallowedTools };
}
