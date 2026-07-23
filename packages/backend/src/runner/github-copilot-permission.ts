import { parseRule } from "@crow-central-agency/shared";
import type { Logger } from "pino";
import { SUBCOMMAND_MATCH_MODE } from "./permission-rule/command-decomposition.js";
import type { PermissionRuleSet } from "./permission-rule/rule-set.js";

/** How the current turn resolves permission requests: prompt the user, deny outright, or allow all. */
export type PermissionPolicy = "prompt" | "deny" | "allow";

/** Outcome of evaluating an agent's configured deny/allow rules against a tool call. */
export const COPILOT_PERMISSION_DECISION = {
  /** A disallowed rule matched — reject, overriding both auto-approve and the allow/bypass policy. */
  DENY: "deny",
  /** Allowed by the bypass policy or an auto-approve rule. */
  ALLOW: "allow",
  /** No rule matched and no user is reachable to prompt. */
  UNAVAILABLE: "unavailable",
  /** No rule matched — ask the user. */
  PROMPT: "prompt",
} as const;

export type CopilotPermissionDecision = (typeof COPILOT_PERMISSION_DECISION)[keyof typeof COPILOT_PERMISSION_DECISION];

export interface CopilotPermissionQuery {
  logger: Logger;
  disallowed: PermissionRuleSet;
  autoApproved: PermissionRuleSet;
  policy: PermissionPolicy;
  toolName: string;
  input: Record<string, unknown>;
}

/**
 * Resolve a tool call against the agent's configured rules, deny-first: a disallowed match rejects
 * before any auto-approve or bypass is considered, mirroring Claude's SDK precedence of
 * `disallowedTools` over `bypassPermissions`. Returns PROMPT only when nothing matches and a user
 * can be asked; the caller owns the prompt round-trip.
 */
export function resolveConfiguredPermission({
  logger,
  disallowed,
  autoApproved,
  policy,
  toolName,
  input,
}: CopilotPermissionQuery): CopilotPermissionDecision {
  if (disallowed.matches(toolName, input, SUBCOMMAND_MATCH_MODE.ANY)) {
    logger.info({ toolName, input }, "tool use auto-deny");
    return COPILOT_PERMISSION_DECISION.DENY;
  }

  if (policy === "allow") {
    logger.info({ toolName, input }, "tool use policy allow");
    return COPILOT_PERMISSION_DECISION.ALLOW;
  }

  if (autoApproved.matches(toolName, input)) {
    logger.info({ toolName, input }, "tool use auto-approve");
    return COPILOT_PERMISSION_DECISION.ALLOW;
  }

  if (policy === "deny") {
    logger.info({ toolName, input }, "tool use policy deny");
    return COPILOT_PERMISSION_DECISION.UNAVAILABLE;
  }

  return COPILOT_PERMISSION_DECISION.PROMPT;
}

/**
 * The whole-tool (no-specifier) deny rules — the only ones Copilot's exact-name `excludedTools` can
 * enforce. Specifier-bearing denies (e.g. `PowerShell(npm run build *)`) would be read as a literal
 * tool name and match nothing, so they stay out of `excludedTools` and are enforced in-house.
 * Malformed rules are dropped.
 */
export function wholeToolDenyRules(disallowedTools: string[]): string[] {
  return disallowedTools.filter((rule) => {
    const parsed = parseRule(rule);
    return parsed !== undefined && parsed.specifier === undefined;
  });
}
