import { parseRule } from "@crow-central-agency/shared";

/**
 * Keep only the client-supplied rules the shared parser accepts. Strings are preserved verbatim so
 * a valid rule persists exactly as the user typed it; unparseable rules are dropped before they can
 * become invisible dead config in `toolConfig`.
 */
export function filterParseableRules(rules: string[]): string[] {
  return rules.filter((rule) => parseRule(rule) !== undefined);
}

/** The rules an allow_always persists: the client's edited rules when present, else the derived ones. */
export function resolveRulesToPersist(clientRules: string[] | undefined, derivedRules: string[]): string[] {
  return clientRules ?? derivedRules;
}
