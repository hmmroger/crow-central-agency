import { describe, expect, it } from "vitest";
import { deriveRules, isReadOnlyCommand, matchesRules, splitSubcommands } from "./command-decomposition.js";

describe("splitSubcommands", () => {
  it("splits on every shell separator", () => {
    expect(splitSubcommands("a && b || c ; d | e")).toEqual(["a", "b", "c", "d", "e"]);
    expect(splitSubcommands("a |& b & c")).toEqual(["a", "b", "c"]);
    expect(splitSubcommands("a\nb")).toEqual(["a", "b"]);
  });

  it("does not split separators inside quotes", () => {
    expect(splitSubcommands('echo "a && b"')).toEqual(["echo a && b"]);
    expect(splitSubcommands("echo 'x | y'")).toEqual(["echo x | y"]);
  });

  it("does not treat redirects as background separators", () => {
    expect(splitSubcommands("git push 2>&1")).toEqual(["git push 2>&1"]);
    expect(splitSubcommands("cmd &>out.log")).toEqual(["cmd &>out.log"]);
  });

  it("strips process wrappers, including nested ones and their numeric args", () => {
    expect(splitSubcommands("timeout 5 git commit")).toEqual(["git commit"]);
    expect(splitSubcommands("nice -n 10 npm test")).toEqual(["npm test"]);
    expect(splitSubcommands("nohup timeout 30 build")).toEqual(["build"]);
    expect(splitSubcommands("stdbuf -oL grep foo")).toEqual(["grep foo"]);
  });

  it("strips bare xargs but leaves flagged xargs untouched", () => {
    expect(splitSubcommands("find . | xargs rm")).toEqual(["find .", "rm"]);
    expect(splitSubcommands("find . | xargs -0 rm")).toEqual(["find .", "xargs -0 rm"]);
  });

  it("drops empty segments and returns empty for empty input", () => {
    expect(splitSubcommands("")).toEqual([]);
    expect(splitSubcommands("   ")).toEqual([]);
    expect(splitSubcommands("a && ")).toEqual(["a"]);
  });
});

describe("isReadOnlyCommand", () => {
  it("recognizes read-only builtins", () => {
    expect(isReadOnlyCommand("ls -la")).toBe(true);
    expect(isReadOnlyCommand("cat file")).toBe(true);
    expect(isReadOnlyCommand("rm -rf /")).toBe(false);
  });

  it("treats cd as read-only only for the current directory", () => {
    expect(isReadOnlyCommand("cd")).toBe(true);
    expect(isReadOnlyCommand("cd .")).toBe(true);
    expect(isReadOnlyCommand("cd ./")).toBe(true);
    expect(isReadOnlyCommand("cd /other")).toBe(false);
    expect(isReadOnlyCommand("cd src")).toBe(false);
  });

  it("treats only read-only git subcommands as read-only", () => {
    expect(isReadOnlyCommand("git status")).toBe(true);
    expect(isReadOnlyCommand("git log --oneline")).toBe(true);
    expect(isReadOnlyCommand("git diff")).toBe(true);
    expect(isReadOnlyCommand("git push")).toBe(false);
    expect(isReadOnlyCommand("git")).toBe(false);
  });
});

describe("deriveRules", () => {
  it("derives one prefix-2 specifier per non-read-only subcommand", () => {
    expect(deriveRules("git commit -m msg")).toEqual(["git commit *"]);
    expect(deriveRules("npm run build && npm test")).toEqual(["npm run *", "npm test *"]);
  });

  it("skips read-only builtins and in-cwd cd", () => {
    expect(deriveRules("cd . && ls -la && git status")).toEqual([]);
    expect(deriveRules("cd src && npm test")).toEqual(["cd src *", "npm test *"]);
  });

  it("dedupes identical prefixes", () => {
    expect(deriveRules("git add a && git add b")).toEqual(["git add *"]);
  });

  it("caps at five rules", () => {
    const command = "c1 x && c2 x && c3 x && c4 x && c5 x && c6 x";
    expect(deriveRules(command)).toEqual(["c1 x *", "c2 x *", "c3 x *", "c4 x *", "c5 x *"]);
  });

  it("returns empty for empty input", () => {
    expect(deriveRules("")).toEqual([]);
  });
});

describe("matchesRules", () => {
  it("approves when every subcommand matches a specifier", () => {
    expect(matchesRules("git commit -m x", ["git commit *"])).toBe(true);
    expect(matchesRules("git add . && git commit -m x", ["git add *", "git commit *"])).toBe(true);
  });

  it("approves read-only builtins without a matching specifier", () => {
    expect(matchesRules("ls -la && git commit -m x", ["git commit *"])).toBe(true);
    expect(matchesRules("cd . && git status", [])).toBe(true);
  });

  it("fails closed when any subcommand is unmatched (the auth-bypass case)", () => {
    expect(matchesRules("git add x && rm -rf /", ["git add *"])).toBe(false);
    expect(matchesRules("cd /other && git commit -m x", ["git commit *"])).toBe(false);
  });

  it("fails closed on empty input or no specifiers for a mutating command", () => {
    expect(matchesRules("", ["git commit *"])).toBe(false);
    expect(matchesRules("npm publish", [])).toBe(false);
  });

  it("respects the word boundary when matching", () => {
    expect(matchesRules("lsof", ["ls *"])).toBe(false);
  });
});
