import { describe, expect, it } from "vitest";
import { PermissionRuleSet } from "./rule-set.js";

describe("PermissionRuleSet", () => {
  it("matches a whole-tool rule via the default strategy", () => {
    const ruleSet = new PermissionRuleSet(["Write"]);
    expect(ruleSet.matches("Write", {})).toBe(true);
    expect(ruleSet.matches("Read", {})).toBe(false);
  });

  it("matches a whole-tool rule case-insensitively (allow or deny path)", () => {
    expect(new PermissionRuleSet(["Bash"]).matches("bash", {})).toBe(true);
    expect(new PermissionRuleSet(["bash"]).matches("Bash", {})).toBe(true);
  });

  it("matches a command rule via the command strategy", () => {
    const ruleSet = new PermissionRuleSet(["Bash(git commit *)"]);
    expect(ruleSet.matches("Bash", { command: "git commit -m x" })).toBe(true);
    expect(ruleSet.matches("Bash", { command: "git push" })).toBe(false);
  });

  it("reflects incrementally added rules in subsequent matches", () => {
    const ruleSet = new PermissionRuleSet();
    expect(ruleSet.matches("Bash", { command: "npm test" })).toBe(false);

    ruleSet.add(["Bash(npm test *)"]);
    expect(ruleSet.matches("Bash", { command: "npm test --watch" })).toBe(true);
  });

  it("dedupes rules re-added later without affecting matching", () => {
    const ruleSet = new PermissionRuleSet(["Bash(git add *)"]);
    ruleSet.add(["Bash(git add *)", "Bash(git add *)"]);
    expect(ruleSet.matches("Bash", { command: "git add ." })).toBe(true);
  });

  it("drops malformed rules on add, keeping valid ones", () => {
    const ruleSet = new PermissionRuleSet(["Bash(git commit", "Write"]);
    expect(ruleSet.matches("Write", {})).toBe(true);
    expect(ruleSet.matches("Bash", { command: "git commit -m x" })).toBe(false);
  });

  // The Claude runner now routes every config approval through this set (no SDK `allowedTools`), so
  // the set is the sole approve authority — matching how the Copilot runner already works.
  describe("unified approve authority (Claude parity)", () => {
    it("auto-approves a config command rule with no native allowedTools", () => {
      const ruleSet = new PermissionRuleSet(["Bash(git commit *)"]);
      expect(ruleSet.matches("Bash", { command: "git commit -m x" })).toBe(true);
    });

    it("auto-approves an internal-MCP tool via the seeded ${prefix}* rule", () => {
      const internalMcpPrefix = "mcp__crow-artifacts__";
      const ruleSet = new PermissionRuleSet([`${internalMcpPrefix}*`]);
      expect(ruleSet.matches(`${internalMcpPrefix}read`, {})).toBe(true);
      expect(ruleSet.matches("mcp__other__read", {})).toBe(false);
    });

    it("auto-approves a whole-tool rule but prompts a specifier-bearing rule (D5 interim gap)", () => {
      // Whole-tool `Read` still matches via wholeToolMatches; `Read(src/**)` prompts until a
      // path-glob strategy lands, so it does not yet auto-approve on Claude.
      expect(new PermissionRuleSet(["Read"]).matches("Read", { file_path: "src/index.ts" })).toBe(true);
      expect(new PermissionRuleSet(["Read(src/**)"]).matches("Read", { file_path: "src/index.ts" })).toBe(false);
    });

    it("accumulates an allow_always derived rule into the single set for later same-session calls", () => {
      const ruleSet = new PermissionRuleSet(["Bash(git commit *)"]);
      expect(ruleSet.matches("Bash", { command: "npm run build" })).toBe(false);

      const rulesToPersist = ruleSet.deriveNewRules("Bash", { command: "npm run build" });
      expect(rulesToPersist).toEqual(["Bash(npm run build *)"]);

      ruleSet.add(rulesToPersist);
      expect(ruleSet.matches("Bash", { command: "npm run build --watch" })).toBe(true);
    });
  });

  describe("deriveNewRules", () => {
    it("omits subcommands already covered by the set's own rules", () => {
      const ruleSet = new PermissionRuleSet(["Bash(cd /tmp *)"]);
      expect(ruleSet.deriveNewRules("Bash", { command: "cd /tmp && npm run build" })).toEqual([
        "Bash(npm run build *)",
      ]);
    });

    it("is diff-aware against a config-seeded reference set (Claude path)", () => {
      const referenceSet = new PermissionRuleSet(["Bash(cd *)"]);
      expect(referenceSet.deriveNewRules("Bash", { command: "cd /tmp && npm run build" })).toEqual([
        "Bash(npm run build *)",
      ]);
    });

    it("derives every subcommand rule when nothing is covered", () => {
      const ruleSet = new PermissionRuleSet();
      expect(ruleSet.deriveNewRules("Bash", { command: "cd /tmp && npm run build" })).toEqual([
        "Bash(cd /tmp *)",
        "Bash(npm run build *)",
      ]);
    });

    it("returns empty when every subcommand is already covered", () => {
      const ruleSet = new PermissionRuleSet(["Bash(cd /tmp *)", "Bash(npm run build *)"]);
      expect(ruleSet.deriveNewRules("Bash", { command: "cd /tmp && npm run build" })).toEqual([]);
    });

    it("scopes existing specifiers to the matching tool only", () => {
      const ruleSet = new PermissionRuleSet(["PowerShell(npm run build *)"]);
      expect(ruleSet.deriveNewRules("Bash", { command: "npm run build" })).toEqual(["Bash(npm run build *)"]);
    });

    it("reflects rules added after construction (allow_always accumulation)", () => {
      const ruleSet = new PermissionRuleSet();
      expect(ruleSet.deriveNewRules("Bash", { command: "npm test" })).toEqual(["Bash(npm test *)"]);

      ruleSet.add(["Bash(npm test *)"]);
      expect(ruleSet.deriveNewRules("Bash", { command: "npm test && npm run build" })).toEqual([
        "Bash(npm run build *)",
      ]);
    });

    it("derives the whole-tool rule for non-command tools", () => {
      expect(new PermissionRuleSet().deriveNewRules("Write", {})).toEqual(["Write"]);
    });
  });
});
