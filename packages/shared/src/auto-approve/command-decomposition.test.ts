import { describe, expect, it } from "vitest";
import { deriveRules, matchesRules, splitSubcommands, SUBCOMMAND_MATCH_MODE } from "./command-decomposition.js";

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

describe("deriveRules", () => {
  it("derives a flag-aware prefix specifier per subcommand (depth counts non-flag tokens only)", () => {
    expect(deriveRules("npm run build")).toEqual(["npm run build *"]);
    expect(deriveRules("git commit -m x")).toEqual(["git commit -m x *"]);
    expect(deriveRules("npm run build && npm test")).toEqual(["npm run build *", "npm test *"]);
  });

  it("keeps flags and their values inline without counting them toward depth", () => {
    expect(deriveRules("git -C /dir/abc command xyz")).toEqual(["git -C /dir/abc command xyz *"]);
    expect(deriveRules("docker -H host compose up")).toEqual(["docker -H host compose up *"]);
    expect(deriveRules("rm -rf /tmp/build")).toEqual(["rm -rf /tmp/build *"]);
  });

  it("derives rules for every subcommand, including former read-only builtins", () => {
    expect(deriveRules("ls -la && git status")).toEqual(["ls -la *", "git status *"]);
    expect(deriveRules("cd src && npm test")).toEqual(["cd src *", "npm test *"]);
  });

  it("contributes nothing for a subcommand with no non-flag token", () => {
    expect(deriveRules("--flag")).toEqual([]);
    expect(deriveRules("--flag && npm test")).toEqual(["npm test *"]);
  });

  it("dedupes identical prefixes", () => {
    expect(deriveRules("npm run build one && npm run build two")).toEqual(["npm run build *"]);
  });

  it("caps at five rules for a long chain", () => {
    const command = "c1 x && c2 x && c3 x && c4 x && c5 x && c6 x";
    expect(deriveRules(command)).toEqual(["c1 x *", "c2 x *", "c3 x *", "c4 x *", "c5 x *"]);
  });

  it("returns empty for empty input", () => {
    expect(deriveRules("")).toEqual([]);
  });
});

describe("matchesRules", () => {
  it("approves when every subcommand matches a specifier via literal prefix", () => {
    expect(matchesRules("git commit -m x", ["git commit *"])).toBe(true);
    expect(matchesRules("git add . && git commit -m x", ["git add *", "git commit *"])).toBe(true);
  });

  it("matches a rule against its own source command (literal prefix)", () => {
    expect(matchesRules("git -C /dir/abc command xyz", ["git -C /dir/abc command *"])).toBe(true);
    expect(matchesRules("npm run build", deriveRules("npm run build"))).toBe(true);
  });

  it("no longer auto-approves read-only commands without a matching rule", () => {
    expect(matchesRules("ls -la", [])).toBe(false);
    expect(matchesRules("cat .env", [])).toBe(false);
    expect(matchesRules("cd . && git status", [])).toBe(false);
  });

  it("fails closed when any subcommand is unmatched (the auth-bypass case)", () => {
    expect(matchesRules("git add x && rm -rf /", ["git add *"])).toBe(false);
    expect(matchesRules("cd /other && git commit -m x", ["git commit *"])).toBe(false);
  });

  it("fails closed on empty or unparseable input", () => {
    expect(matchesRules("", ["git commit *"])).toBe(false);
    expect(matchesRules("npm publish", [])).toBe(false);
  });

  it("respects the word boundary when matching", () => {
    expect(matchesRules("lsof", ["ls *"])).toBe(false);
  });

  it("matches ANY subcommand in deny mode while ALL requires every part", () => {
    expect(matchesRules("a && b", ["a *"], SUBCOMMAND_MATCH_MODE.ANY)).toBe(true);
    expect(matchesRules("a && b", ["a *"], SUBCOMMAND_MATCH_MODE.ALL)).toBe(false);
    expect(matchesRules("npm i && rm -rf x", ["rm *"], SUBCOMMAND_MATCH_MODE.ANY)).toBe(true);
  });

  it("fails closed in ANY mode on empty specifiers or empty command", () => {
    expect(matchesRules("a && b", [], SUBCOMMAND_MATCH_MODE.ANY)).toBe(false);
    expect(matchesRules("", ["a *"], SUBCOMMAND_MATCH_MODE.ANY)).toBe(false);
  });
});
