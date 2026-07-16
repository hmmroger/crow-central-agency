import { describe, expect, it } from "vitest";
import { buildPermissionGroups } from "./permission-grouping.js";

describe("buildPermissionGroups", () => {
  it("groups Claude Code mcp__ tools under their server, merging catalog and custom rows", () => {
    const catalog = ["mcp__github__create_issue", "mcp__github__list_issues"];
    const custom = ["mcp__github__delete_issue"];

    const groups = buildPermissionGroups(catalog, custom, []);
    const githubGroup = groups.find((group) => group.key === "mcp:github");

    expect(githubGroup).toBeDefined();
    expect(githubGroup?.label).toBe("github");
    expect(githubGroup?.entries.map((entry) => entry.displayName)).toEqual([
      "create_issue",
      "list_issues",
      "delete_issue",
    ]);
    expect(githubGroup?.entries.map((entry) => entry.removable)).toEqual([false, false, true]);
  });

  it("groups Copilot external ${server}-${tool} tools under the matching known server", () => {
    const catalog = ["github_mcp-create_issue"];
    const custom = ["github_mcp-delete_issue"];

    const groups = buildPermissionGroups(catalog, custom, ["github_mcp"]);
    const group = groups.find((existing) => existing.key === "mcp:github_mcp");

    expect(group).toBeDefined();
    expect(group?.label).toBe("github_mcp");
    expect(group?.entries.map((entry) => entry.displayName)).toEqual(["create_issue", "delete_issue"]);
    expect(group?.entries.map((entry) => entry.removable)).toEqual([false, true]);
  });

  it("renders an external server wildcard tool as *", () => {
    const groups = buildPermissionGroups([], ["github_mcp-*"], ["github_mcp"]);
    const group = groups.find((existing) => existing.key === "mcp:github_mcp");

    expect(group?.entries.map((entry) => entry.displayName)).toEqual(["*"]);
  });

  it("preserves a command specifier on an external tool", () => {
    const groups = buildPermissionGroups([], ["github_mcp-run_command(git status)"], ["github_mcp"]);
    const group = groups.find((existing) => existing.key === "mcp:github_mcp");

    expect(group?.entries.map((entry) => entry.displayName)).toEqual(["run_command(git status)"]);
  });

  it("disambiguates overlapping server names by longest match", () => {
    const groups = buildPermissionGroups(["a-b-foo"], [], ["a", "a-b"]);

    expect(groups.find((group) => group.key === "mcp:a-b")?.entries.map((entry) => entry.displayName)).toEqual(["foo"]);
    expect(groups.find((group) => group.key === "mcp:a")).toBeUndefined();
  });

  it("leaves an unknown ${a}-${b} tool as its own custom bucket", () => {
    const groups = buildPermissionGroups([], ["foo-bar"], ["github_mcp"]);

    expect(groups.find((group) => group.key.startsWith("mcp:"))).toBeUndefined();
    expect(groups.find((group) => group.key === "custom:foo-bar")?.entries.map((entry) => entry.displayName)).toEqual([
      "foo-bar",
    ]);
  });
});
