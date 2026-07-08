import { describe, expect, it } from "vitest";
import { formatRule, matchesSpecifier, parseRule, parseRules } from "./rule-format.js";

describe("parseRule", () => {
  it("parses a whole-tool rule", () => {
    expect(parseRule("Write")).toEqual({ tool: "Write" });
  });

  it("parses a scoped rule", () => {
    expect(parseRule("Bash(git commit *)")).toEqual({ tool: "Bash", specifier: "git commit *" });
  });

  it("parses wildcard and MCP prefixes as whole-tool rules", () => {
    expect(parseRule("*")).toEqual({ tool: "*" });
    expect(parseRule("mcp__crow-artifacts__*")).toEqual({ tool: "mcp__crow-artifacts__*" });
  });

  it("preserves an empty specifier", () => {
    expect(parseRule("Bash()")).toEqual({ tool: "Bash", specifier: "" });
  });

  it("trims surrounding whitespace on the rule string", () => {
    expect(parseRule("  Bash(ls *)  ")).toEqual({ tool: "Bash", specifier: "ls *" });
  });

  it("trims whitespace inside the specifier", () => {
    expect(parseRule("Bash(  git commit *  )")).toEqual({ tool: "Bash", specifier: "git commit *" });
  });

  it("fails closed on unbalanced or empty input", () => {
    expect(parseRule("")).toBeUndefined();
    expect(parseRule("   ")).toBeUndefined();
    expect(parseRule("Bash(git commit")).toBeUndefined();
    expect(parseRule("(git commit *)")).toBeUndefined();
  });
});

describe("parseRules", () => {
  it("discards rules that fail to parse", () => {
    expect(parseRules(["Bash(ls *)", "Bash(bad", "Write"])).toEqual([
      { tool: "Bash", specifier: "ls *" },
      { tool: "Write" },
    ]);
  });
});

describe("formatRule", () => {
  it("round-trips whole-tool and scoped rules", () => {
    expect(formatRule({ tool: "Write" })).toBe("Write");
    expect(formatRule({ tool: "Bash", specifier: "git commit *" })).toBe("Bash(git commit *)");
  });
});

describe("matchesSpecifier", () => {
  it("enforces a word boundary on a trailing space-star", () => {
    expect(matchesSpecifier("ls -la", "ls *")).toBe(true);
    expect(matchesSpecifier("ls", "ls *")).toBe(true);
    expect(matchesSpecifier("lsof", "ls *")).toBe(false);
  });

  it("treats a trailing :* as equivalent to a space-star", () => {
    expect(matchesSpecifier("git commit -m x", "git commit:*")).toBe(true);
    expect(matchesSpecifier("git commit", "git commit:*")).toBe(true);
    expect(matchesSpecifier("git committed", "git commit:*")).toBe(false);
  });

  it("matches exactly when there is no wildcard", () => {
    expect(matchesSpecifier("git status", "git status")).toBe(true);
    expect(matchesSpecifier("git status -s", "git status")).toBe(false);
  });

  it("supports a general wildcard", () => {
    expect(matchesSpecifier("gitfoo", "git*")).toBe(true);
    expect(matchesSpecifier("git status", "git*")).toBe(true);
  });
});
