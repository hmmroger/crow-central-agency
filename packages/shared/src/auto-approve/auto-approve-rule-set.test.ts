import { describe, expect, it } from "vitest";
import { AutoApproveRuleSet } from "./auto-approve-rule-set.js";

describe("AutoApproveRuleSet", () => {
  it("matches a whole-tool rule via the default strategy", () => {
    const ruleSet = new AutoApproveRuleSet(["Write"]);
    expect(ruleSet.matches("Write", {})).toBe(true);
    expect(ruleSet.matches("Read", {})).toBe(false);
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
});
