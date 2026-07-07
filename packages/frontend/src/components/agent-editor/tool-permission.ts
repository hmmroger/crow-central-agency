/** Per-rule permission disposition derived from the auto-approved / disallowed arrays. */
export const TOOL_DISPOSITION = {
  ASK: "ask",
  APPROVE: "approve",
  DENY: "deny",
} as const;

export type ToolDisposition = (typeof TOOL_DISPOSITION)[keyof typeof TOOL_DISPOSITION];

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
