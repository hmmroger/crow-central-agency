import { describe, expect, it } from "vitest";
import { partitionAllowRules } from "./claude-code-allow-partition.js";

describe("partitionAllowRules", () => {
  it("delegates default-strategy specifier rules to native allowedTools", () => {
    const rules = ["WebFetch(domain:github.com)", "Read(src/**)", "WebSearch(query:foo)"];
    expect(partitionAllowRules(rules)).toEqual({
      ownedByMatcher: [],
      delegatedToNative: rules,
    });
  });

  it("keeps whole-tool, command-specifier, MCP-prefix, and malformed rules owned by the matcher", () => {
    const rules = [
      "WebFetch",
      "Read",
      "Bash",
      "Bash(git commit *)",
      "PowerShell(Get-ChildItem *)",
      "mcp__crow-artifacts__*",
      "Read(",
    ];
    expect(partitionAllowRules(rules)).toEqual({
      ownedByMatcher: rules,
      delegatedToNative: [],
    });
  });

  it("partitions a mixed config, preserving input order in each bucket", () => {
    expect(partitionAllowRules(["WebFetch(domain:github.com)", "Bash(git commit *)", "Read"])).toEqual({
      ownedByMatcher: ["Bash(git commit *)", "Read"],
      delegatedToNative: ["WebFetch(domain:github.com)"],
    });
  });
});
