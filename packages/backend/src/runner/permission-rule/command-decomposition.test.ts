import { describe, expect, it } from "vitest";
import {
  deriveNewCommandRules,
  deriveCommandRules,
  matchesCommandRules,
  splitSubcommands,
  SHELL,
  SUBCOMMAND_MATCH_MODE,
} from "./command-decomposition.js";

describe("splitSubcommands (bash)", () => {
  it("splits on every shell separator", () => {
    expect(splitSubcommands("a && b || c ; d | e", SHELL.BASH)).toEqual(["a", "b", "c", "d", "e"]);
    expect(splitSubcommands("a |& b & c", SHELL.BASH)).toEqual(["a", "b", "c"]);
    expect(splitSubcommands("a\nb", SHELL.BASH)).toEqual(["a", "b"]);
  });

  it("preserves each subcommand as a literal slice of the original", () => {
    expect(splitSubcommands('echo "a && b"', SHELL.BASH)).toEqual(['echo "a && b"']);
    expect(splitSubcommands("echo 'x | y'", SHELL.BASH)).toEqual(["echo 'x | y'"]);
    expect(splitSubcommands("git commit -m 'fix: a; b'", SHELL.BASH)).toEqual(["git commit -m 'fix: a; b'"]);
  });

  it("does not treat redirects as background separators", () => {
    expect(splitSubcommands("git push 2>&1", SHELL.BASH)).toEqual(["git push 2>&1"]);
    expect(splitSubcommands("cmd &>out.log", SHELL.BASH)).toEqual(["cmd &>out.log"]);
  });

  it("keeps process wrappers as literal command text (no wrapper stripping)", () => {
    expect(splitSubcommands("timeout 5 git commit", SHELL.BASH)).toEqual(["timeout 5 git commit"]);
    expect(splitSubcommands("find . | xargs rm", SHELL.BASH)).toEqual(["find .", "xargs rm"]);
  });

  it("drops empty segments and returns empty for empty input", () => {
    expect(splitSubcommands("", SHELL.BASH)).toEqual([]);
    expect(splitSubcommands("   ", SHELL.BASH)).toEqual([]);
    expect(splitSubcommands("a && ", SHELL.BASH)).toEqual(["a"]);
  });

  it("does not split on separators inside a single-quoted argument (sed script)", () => {
    const command = String.raw`cd pkg && sed -i 's/\bfoo\b/bar/g; s/\bbaz\b/qux/g' file.ts && grep -n "hi" file.ts`;
    expect(splitSubcommands(command, SHELL.BASH)).toEqual([
      "cd pkg",
      String.raw`sed -i 's/\bfoo\b/bar/g; s/\bbaz\b/qux/g' file.ts`,
      'grep -n "hi" file.ts',
    ]);
  });

  it("honors a backslash-escaped quote inside double quotes (Bug 2: no under-split)", () => {
    // Bash reads `\"` inside double quotes as a literal quote. Here the quote is never closed, so we
    // fail toward splitting: the top-level `&&` MUST still split into two subcommands — otherwise
    // `rm -rf ~` hides inside the first subcommand and auto-approves under `echo *`.
    expect(splitSubcommands(String.raw`echo "x\" && rm -rf ~`, SHELL.BASH)).toEqual([
      String.raw`echo "x\"`,
      "rm -rf ~",
    ]);
    // A properly closed string with an escaped inner quote splits on the following top-level `&&`.
    expect(splitSubcommands(String.raw`echo "a\"b" && rm -rf x`, SHELL.BASH)).toEqual([
      String.raw`echo "a\"b"`,
      "rm -rf x",
    ]);
  });

  it("honors a backslash-escaped separator outside quotes", () => {
    expect(splitSubcommands(String.raw`echo a\&\& b`, SHELL.BASH)).toEqual([String.raw`echo a\&\& b`]);
  });
});

describe("splitSubcommands (powershell)", () => {
  it("treats a backslash as an ordinary path char, splitting on a top-level separator", () => {
    expect(splitSubcommands(String.raw`echo C:\a; echo C:\b`, SHELL.POWERSHELL)).toEqual([
      String.raw`echo C:\a`,
      String.raw`echo C:\b`,
    ]);
  });

  it("uses backtick as the escape char inside double quotes", () => {
    expect(splitSubcommands('echo "x`" ; rm y"', SHELL.POWERSHELL)).toEqual(['echo "x`" ; rm y"']);
  });

  it("treats a doubled quote as an embedded quote keeping the string open", () => {
    expect(splitSubcommands('echo "a ; ""b"" c" ; rm x', SHELL.POWERSHELL)).toEqual(['echo "a ; ""b"" c"', "rm x"]);
    expect(splitSubcommands("echo 'a ; ''b'' c' ; rm x", SHELL.POWERSHELL)).toEqual(["echo 'a ; ''b'' c'", "rm x"]);
  });
});

describe("deriveCommandRules", () => {
  it("derives a flag-aware prefix specifier per subcommand (depth counts non-flag tokens only)", () => {
    expect(deriveCommandRules("npm run build", SHELL.BASH)).toEqual(["npm run build *"]);
    expect(deriveCommandRules("git commit -m x", SHELL.BASH)).toEqual(["git commit -m x *"]);
    expect(deriveCommandRules("npm run build && npm test", SHELL.BASH)).toEqual(["npm run build *", "npm test *"]);
  });

  it("keeps flags and their values inline without counting them toward depth", () => {
    expect(deriveCommandRules("git -C /dir/abc command xyz", SHELL.BASH)).toEqual(["git -C /dir/abc command xyz *"]);
    expect(deriveCommandRules("docker -H host compose up", SHELL.BASH)).toEqual(["docker -H host compose up *"]);
    expect(deriveCommandRules("rm -rf /tmp/build", SHELL.BASH)).toEqual(["rm -rf /tmp/build *"]);
  });

  it("derives a literal prefix, preserving quotes verbatim", () => {
    expect(deriveCommandRules("git commit -m 'fix: a; b'", SHELL.BASH)).toEqual(["git commit -m 'fix: a; b' *"]);
    expect(deriveCommandRules(String.raw`sed -i 's/a; b/c/' file`, SHELL.BASH)).toEqual([
      String.raw`sed -i 's/a; b/c/' file *`,
    ]);
  });

  it("derives rules for every subcommand, including former read-only builtins", () => {
    expect(deriveCommandRules("ls -la && git status", SHELL.BASH)).toEqual(["ls -la *", "git status *"]);
    expect(deriveCommandRules("cd src && npm test", SHELL.BASH)).toEqual(["cd src *", "npm test *"]);
  });

  it("contributes nothing for a subcommand with no non-flag token", () => {
    expect(deriveCommandRules("--flag", SHELL.BASH)).toEqual([]);
    expect(deriveCommandRules("--flag && npm test", SHELL.BASH)).toEqual(["npm test *"]);
  });

  it("dedupes identical prefixes", () => {
    expect(deriveCommandRules("npm run build one && npm run build two", SHELL.BASH)).toEqual(["npm run build *"]);
  });

  it("caps at five rules for a long chain", () => {
    const command = "c1 x && c2 x && c3 x && c4 x && c5 x && c6 x";
    expect(deriveCommandRules(command, SHELL.BASH)).toEqual(["c1 x *", "c2 x *", "c3 x *", "c4 x *", "c5 x *"]);
  });

  it("returns empty for empty input", () => {
    expect(deriveCommandRules("", SHELL.BASH)).toEqual([]);
  });
});

describe("deriveNewCommandRules", () => {
  it("skips subcommands already covered by an existing specifier", () => {
    expect(deriveNewCommandRules("cd /tmp && npm run build", ["cd /tmp *"], SHELL.BASH)).toEqual(["npm run build *"]);
    expect(deriveNewCommandRules("cd /tmp && npm run build", ["cd *"], SHELL.BASH)).toEqual(["npm run build *"]);
  });

  it("still derives every subcommand when none are covered", () => {
    expect(deriveNewCommandRules("cd /tmp && npm run build", [], SHELL.BASH)).toEqual(["cd /tmp *", "npm run build *"]);
    expect(deriveNewCommandRules("git add . && git commit -m x", ["npm *"], SHELL.BASH)).toEqual([
      "git add . *",
      "git commit -m x *",
    ]);
  });

  it("returns empty when every subcommand is already covered", () => {
    expect(deriveNewCommandRules("cd /tmp && npm run build", ["cd /tmp *", "npm run build *"], SHELL.BASH)).toEqual([]);
    expect(deriveNewCommandRules("git status", ["git status *"], SHELL.BASH)).toEqual([]);
  });

  it("does not re-split a quoted separator inside an already-decomposed subcommand", () => {
    // The single-quoted sed script carries an internal `;`; deriving per-subcommand must not
    // decompose it a second time. It stays one rule, matching deriveCommandRules exactly.
    const command = String.raw`cd pkg && sed -i 's/\bfoo\b/bar/g; s/\bbaz\b/qux/g' file.ts && grep -n hi file.ts`;
    expect(deriveNewCommandRules(command, [], SHELL.BASH)).toEqual([
      "cd pkg *",
      String.raw`sed -i 's/\bfoo\b/bar/g; s/\bbaz\b/qux/g' file.ts *`,
      "grep -n hi file.ts *",
    ]);
    expect(deriveNewCommandRules(command, [], SHELL.BASH)).toEqual(deriveCommandRules(command, SHELL.BASH));
  });

  it("dedupes newly derived specifiers and caps at five", () => {
    expect(deriveNewCommandRules("npm run build one && npm run build two", [], SHELL.BASH)).toEqual([
      "npm run build *",
    ]);

    const command = "c1 x && c2 x && c3 x && c4 x && c5 x && c6 x";
    expect(deriveNewCommandRules(command, [], SHELL.BASH)).toEqual(["c1 x *", "c2 x *", "c3 x *", "c4 x *", "c5 x *"]);
  });

  it("returns empty for empty input", () => {
    expect(deriveNewCommandRules("", ["cd /tmp *"], SHELL.BASH)).toEqual([]);
  });
});

describe("matchesCommandRules", () => {
  it("approves when every subcommand matches a specifier via literal prefix", () => {
    expect(matchesCommandRules("git commit -m x", ["git commit *"], SHELL.BASH)).toBe(true);
    expect(matchesCommandRules("git add . && git commit -m x", ["git add *", "git commit *"], SHELL.BASH)).toBe(true);
  });

  it("matches a rule against its own source command (literal prefix)", () => {
    expect(matchesCommandRules("git -C /dir/abc command xyz", ["git -C /dir/abc command *"], SHELL.BASH)).toBe(true);
    expect(matchesCommandRules("npm run build", deriveCommandRules("npm run build", SHELL.BASH), SHELL.BASH)).toBe(
      true
    );
  });

  it("does not auto-approve read-only commands without a matching rule", () => {
    expect(matchesCommandRules("ls -la", [], SHELL.BASH)).toBe(false);
    expect(matchesCommandRules("cat .env", [], SHELL.BASH)).toBe(false);
    expect(matchesCommandRules("cd . && git status", [], SHELL.BASH)).toBe(false);
  });

  it("fails closed when any subcommand is unmatched (the auth-bypass case)", () => {
    expect(matchesCommandRules("git add x && rm -rf /", ["git add *"], SHELL.BASH)).toBe(false);
    expect(matchesCommandRules("cd /other && git commit -m x", ["git commit *"], SHELL.BASH)).toBe(false);
  });

  it("does not auto-approve a hidden command behind an escaped quote (Bug 2 security core)", () => {
    // `echo "x\" && rm -rf ~` splits into `echo "x\"` and `rm -rf ~`. Under a `Bash(echo *)` grant
    // the first matches but `rm -rf ~` does not, so ALL mode fails closed — no auto-approve.
    expect(matchesCommandRules(String.raw`echo "x\" && rm -rf ~`, ["echo *"], SHELL.BASH)).toBe(false);
  });

  it("fails closed on empty or unparseable input", () => {
    expect(matchesCommandRules("", ["git commit *"], SHELL.BASH)).toBe(false);
    expect(matchesCommandRules("npm publish", [], SHELL.BASH)).toBe(false);
  });

  it("respects the word boundary when matching", () => {
    expect(matchesCommandRules("lsof", ["ls *"], SHELL.BASH)).toBe(false);
  });

  it("matches ANY subcommand in deny mode while ALL requires every part", () => {
    expect(matchesCommandRules("a && b", ["a *"], SHELL.BASH, SUBCOMMAND_MATCH_MODE.ANY)).toBe(true);
    expect(matchesCommandRules("a && b", ["a *"], SHELL.BASH, SUBCOMMAND_MATCH_MODE.ALL)).toBe(false);
    expect(matchesCommandRules("npm i && rm -rf x", ["rm *"], SHELL.BASH, SUBCOMMAND_MATCH_MODE.ANY)).toBe(true);
  });

  it("fails closed in ANY mode on empty specifiers or empty command", () => {
    expect(matchesCommandRules("a && b", [], SHELL.BASH, SUBCOMMAND_MATCH_MODE.ANY)).toBe(false);
    expect(matchesCommandRules("", ["a *"], SHELL.BASH, SUBCOMMAND_MATCH_MODE.ANY)).toBe(false);
  });
});
