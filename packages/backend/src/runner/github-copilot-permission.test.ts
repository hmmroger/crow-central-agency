import { describe, expect, it } from "vitest";
import pino from "pino";
import { AutoApproveRuleSet } from "@crow-central-agency/shared";
import {
  COPILOT_PERMISSION_DECISION,
  resolveConfiguredPermission,
  wholeToolDenyRules,
  type PermissionPolicy,
} from "./github-copilot-permission.js";

const POWERSHELL_TOOL = "powershell";

const logger = pino({ level: "silent" });

function resolve(
  disallowedRules: string[],
  autoApprovedRules: string[],
  policy: PermissionPolicy,
  command: string
): string {
  return resolveConfiguredPermission({
    logger,
    disallowed: new AutoApproveRuleSet(disallowedRules),
    autoApproved: new AutoApproveRuleSet(autoApprovedRules),
    policy,
    toolName: POWERSHELL_TOOL,
    input: { command },
  });
}

describe("resolveConfiguredPermission", () => {
  it("denies a command matched by a specifier deny rule", () => {
    expect(resolve(["PowerShell(npm run build *)"], [], "prompt", "npm run build")).toBe(
      COPILOT_PERMISSION_DECISION.DENY
    );
  });

  it("lets a broad deny override a specific allow (deny-over-allow)", () => {
    expect(resolve(["PowerShell(npm run *)"], ["PowerShell(npm run build *)"], "prompt", "npm run build")).toBe(
      COPILOT_PERMISSION_DECISION.DENY
    );
  });

  it("denies only the specifically-denied command under a broad allow", () => {
    const disallowed = ["PowerShell(npm run deploy *)"];
    const autoApproved = ["PowerShell(npm run *)"];
    expect(resolve(disallowed, autoApproved, "prompt", "npm run deploy")).toBe(COPILOT_PERMISSION_DECISION.DENY);
    expect(resolve(disallowed, autoApproved, "prompt", "npm run build")).toBe(COPILOT_PERMISSION_DECISION.ALLOW);
  });

  it("lets deny override the bypass (allow) policy", () => {
    expect(resolve(["PowerShell(npm run build *)"], [], "allow", "npm run build")).toBe(
      COPILOT_PERMISSION_DECISION.DENY
    );
  });

  it("allows via the bypass policy when nothing is denied", () => {
    expect(resolve([], [], "allow", "npm run build")).toBe(COPILOT_PERMISSION_DECISION.ALLOW);
  });

  it("prompts when nothing matches and a user can be asked", () => {
    expect(resolve([], [], "prompt", "npm run build")).toBe(COPILOT_PERMISSION_DECISION.PROMPT);
  });

  it("reports unavailable when nothing matches and no user is reachable", () => {
    expect(resolve([], [], "deny", "npm run build")).toBe(COPILOT_PERMISSION_DECISION.UNAVAILABLE);
  });

  it("denies via a whole-tool deny rule regardless of input", () => {
    expect(resolve([POWERSHELL_TOOL], [], "allow", "anything")).toBe(COPILOT_PERMISSION_DECISION.DENY);
  });

  it("denies a compound command when any subcommand matches a deny rule", () => {
    expect(resolve(["PowerShell(rm *)"], [], "prompt", "npm i && rm -rf x")).toBe(COPILOT_PERMISSION_DECISION.DENY);
  });

  it("still requires every part matched to auto-approve a compound command", () => {
    expect(resolve([], ["PowerShell(npm i *)"], "prompt", "npm i && rm -rf x")).toBe(
      COPILOT_PERMISSION_DECISION.PROMPT
    );
    expect(resolve([], ["PowerShell(npm i *)", "PowerShell(rm *)"], "prompt", "npm i && rm -rf x")).toBe(
      COPILOT_PERMISSION_DECISION.ALLOW
    );
  });

  it("denies a compound command via a whole-tool deny rule", () => {
    expect(resolve([POWERSHELL_TOOL], [], "prompt", "npm i && rm -rf x")).toBe(COPILOT_PERMISSION_DECISION.DENY);
  });
});

describe("wholeToolDenyRules", () => {
  it("keeps only no-specifier rules for exact-name excludedTools", () => {
    expect(wholeToolDenyRules(["PowerShell", "PowerShell(npm run build *)", "Bash"])).toEqual(["PowerShell", "Bash"]);
  });

  it("drops specifier-bearing and malformed rules", () => {
    expect(wholeToolDenyRules(["Bash(rm *)", "Write(", "  "])).toEqual([]);
  });

  it("returns an empty list for no deny rules", () => {
    expect(wholeToolDenyRules([])).toEqual([]);
  });
});
