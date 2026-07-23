import { describe, expect, it } from "vitest";
import { AutoApproveRuleSet } from "./auto-approve-rule-set.js";

describe("AutoApproveRuleSet", () => {
  it("matches a whole-tool rule via the default strategy", () => {
    const ruleSet = new AutoApproveRuleSet(["Write"]);
    expect(ruleSet.matches("Write", {})).toBe(true);
    expect(ruleSet.matches("Read", {})).toBe(false);
  });

  it("matches a whole-tool rule case-insensitively (allow or deny path)", () => {
    expect(new AutoApproveRuleSet(["Bash"]).matches("bash", {})).toBe(true);
    expect(new AutoApproveRuleSet(["bash"]).matches("Bash", {})).toBe(true);
  });

  it("matches a command rule via the command strategy", () => {
    const ruleSet = new AutoApproveRuleSet(["Bash(git commit *)"]);
    expect(ruleSet.matches("Bash", { command: "git commit -m x" })).toBe(true);
    expect(ruleSet.matches("Bash", { command: "git push" })).toBe(false);
  });

  it("reflects incrementally added rules in subsequent matches", () => {
    const ruleSet = new AutoApproveRuleSet();
    expect(ruleSet.matches("Bash", { command: "npm test" })).toBe(false);

    ruleSet.add(["Bash(npm test *)"]);
    expect(ruleSet.matches("Bash", { command: "npm test --watch" })).toBe(true);
  });

  it("dedupes rules re-added later without affecting matching", () => {
    const ruleSet = new AutoApproveRuleSet(["Bash(git add *)"]);
    ruleSet.add(["Bash(git add *)", "Bash(git add *)"]);
    expect(ruleSet.matches("Bash", { command: "git add ." })).toBe(true);
  });

  it("drops malformed rules on add, keeping valid ones", () => {
    const ruleSet = new AutoApproveRuleSet(["Bash(git commit", "Write"]);
    expect(ruleSet.matches("Write", {})).toBe(true);
    expect(ruleSet.matches("Bash", { command: "git commit -m x" })).toBe(false);
  });

  describe("deriveNewRules", () => {
    it("omits subcommands already covered by the set's own rules", () => {
      const ruleSet = new AutoApproveRuleSet(["Bash(cd /tmp *)"]);
      expect(ruleSet.deriveNewRules("Bash", { command: "cd /tmp && npm run build" })).toEqual([
        "Bash(npm run build *)",
      ]);
    });

    it("is diff-aware against a config-seeded reference set (Claude path)", () => {
      const referenceSet = new AutoApproveRuleSet(["Bash(cd *)"]);
      expect(referenceSet.deriveNewRules("Bash", { command: "cd /tmp && npm run build" })).toEqual([
        "Bash(npm run build *)",
      ]);
    });

    it("derives every subcommand rule when nothing is covered", () => {
      const ruleSet = new AutoApproveRuleSet();
      expect(ruleSet.deriveNewRules("Bash", { command: "cd /tmp && npm run build" })).toEqual([
        "Bash(cd /tmp *)",
        "Bash(npm run build *)",
      ]);
    });

    it("returns empty when every subcommand is already covered", () => {
      const ruleSet = new AutoApproveRuleSet(["Bash(cd /tmp *)", "Bash(npm run build *)"]);
      expect(ruleSet.deriveNewRules("Bash", { command: "cd /tmp && npm run build" })).toEqual([]);
    });

    it("scopes existing specifiers to the matching tool only", () => {
      const ruleSet = new AutoApproveRuleSet(["PowerShell(npm run build *)"]);
      expect(ruleSet.deriveNewRules("Bash", { command: "npm run build" })).toEqual(["Bash(npm run build *)"]);
    });

    it("reflects rules added after construction (allow_always accumulation)", () => {
      const ruleSet = new AutoApproveRuleSet();
      expect(ruleSet.deriveNewRules("Bash", { command: "npm test" })).toEqual(["Bash(npm test *)"]);

      ruleSet.add(["Bash(npm test *)"]);
      expect(ruleSet.deriveNewRules("Bash", { command: "npm test && npm run build" })).toEqual([
        "Bash(npm run build *)",
      ]);
    });

    it("derives the whole-tool rule for non-command tools", () => {
      expect(new AutoApproveRuleSet().deriveNewRules("Write", {})).toEqual(["Write"]);
    });
  });
});
