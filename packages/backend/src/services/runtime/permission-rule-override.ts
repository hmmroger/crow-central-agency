import { parseRule } from "@crow-central-agency/shared";

/**
 * Trim each client-supplied rule and keep only the ones the shared parser accepts. Trimming is the
 * only rewrite — a rule is otherwise persisted exactly as typed — and unparseable rules are dropped
 * before they can become invisible dead config in `toolConfig`.
 */
export function trimParseableRules(rules: string[]): string[] {
  return rules.map((rule) => rule.trim()).filter((rule) => parseRule(rule) !== undefined);
}

/** The rules an allow_always persists: the client's edited rules when present, else the derived ones. */
export function resolveRulesToPersist(clientRules: string[] | undefined, derivedRules: string[]): string[] {
  return clientRules ?? derivedRules;
}
