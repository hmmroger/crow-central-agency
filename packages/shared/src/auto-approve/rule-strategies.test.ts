import { describe, expect, it } from "vitest";
import { parseRules } from "./rule-format.js";
import { commandRuleStrategy, defaultRuleStrategy } from "./rule-strategies.js";
import { getRuleStrategy } from "./rule-strategy-registry.js";

describe("getRuleStrategy", () => {
  it("routes command tools (case-insensitively) to the command strategy", () => {
    expect(getRuleStrategy("Bash")).toBe(commandRuleStrategy);
    expect(getRuleStrategy("PowerShell")).toBe(commandRuleStrategy);
    expect(getRuleStrategy("bash")).toBe(commandRuleStrategy);
    expect(getRuleStrategy("powershell")).toBe(commandRuleStrategy);
  });

  it("falls back to the default strategy for other tools", () => {
    expect(getRuleStrategy("Write")).toBe(defaultRuleStrategy);
    expect(getRuleStrategy("mcp__crow-artifacts__read")).toBe(defaultRuleStrategy);
  });
});

describe("defaultRuleStrategy", () => {
  it("derives the whole tool name", () => {
    expect(defaultRuleStrategy.deriveRules("Write", {})).toEqual(["Write"]);
  });

  it("preserves legacy whole-tool matching (exact, wildcard, MCP prefix)", () => {
    expect(defaultRuleStrategy.matches("Write", {}, parseRules(["Write"]))).toBe(true);
    expect(defaultRuleStrategy.matches("Write", {}, parseRules(["*"]))).toBe(true);
    expect(defaultRuleStrategy.matches("mcp__crow-artifacts__read", {}, parseRules(["mcp__crow-artifacts__*"]))).toBe(
      true
    );
    expect(defaultRuleStrategy.matches("Read", {}, parseRules(["Write"]))).toBe(false);
  });

  it("matches the tool name case-insensitively (exact, wildcard prefix, MCP prefix)", () => {
    expect(defaultRuleStrategy.matches("bash", {}, parseRules(["Bash"]))).toBe(true);
    expect(defaultRuleStrategy.matches("Bash", {}, parseRules(["bash"]))).toBe(true);
    expect(defaultRuleStrategy.matches("mcp__crow-artifacts__foo", {}, parseRules(["mcp__Crow-Artifacts__*"]))).toBe(
      true
    );
    expect(defaultRuleStrategy.matches("mcp__Crow-Artifacts__foo", {}, parseRules(["mcp__crow-artifacts__*"]))).toBe(
      true
    );
  });
});

describe("commandRuleStrategy", () => {
  it("derives tool-prefixed rules from the command input", () => {
    expect(commandRuleStrategy.deriveRules("Bash", { command: "git commit -m x && npm test" })).toEqual([
      "Bash(git commit -m x *)",
      "Bash(npm test *)",
    ]);
    expect(commandRuleStrategy.deriveRules("PowerShell", { command: "npm run build" })).toEqual([
      "PowerShell(npm run build *)",
    ]);
  });

  it("returns no derived rules when the command input is missing", () => {
    expect(commandRuleStrategy.deriveRules("Bash", {})).toEqual([]);
  });

  it("matches via command specifiers scoped to the tool", () => {
    const rules = parseRules(["Bash(git commit *)"]);
    expect(commandRuleStrategy.matches("Bash", { command: "git commit -m x" }, rules)).toBe(true);
    expect(commandRuleStrategy.matches("Bash", { command: "git commit -m x && rm -rf /" }, rules)).toBe(false);
  });

  it("still honors a whole-tool Bash rule", () => {
    expect(commandRuleStrategy.matches("Bash", { command: "rm -rf /" }, parseRules(["Bash"]))).toBe(true);
  });

  it("applies Claude-form rules to lowercase Copilot tool names", () => {
    const rules = parseRules(["Bash(npm test *)"]);
    expect(commandRuleStrategy.matches("bash", { command: "npm test" }, rules)).toBe(true);
  });

  it("keeps the command text case-sensitive even though the tool name is not", () => {
    const rules = parseRules(["Bash(git commit *)"]);
    expect(commandRuleStrategy.matches("bash", { command: "GIT COMMIT" }, rules)).toBe(false);
  });

  it("fails closed when the command input is missing", () => {
    expect(commandRuleStrategy.matches("Bash", {}, parseRules(["Bash(git commit *)"]))).toBe(false);
  });
});
