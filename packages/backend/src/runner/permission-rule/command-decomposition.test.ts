import { describe, expect, it } from "vitest";
import {
  deriveNewCommandRules,
  deriveCommandRules,
  matchesCommandRules,
  splitSubcommands,
  SHELL,
  SUBCOMMAND_MATCH_MODE,
} from "./command-decomposition.js";

const REPORTED_HEREDOC_COMMAND = [
  "git add -A && git commit -q -F - <<'EOF'",
  "fix: expand ~ and relative paths in agent workspace resolution",
  "",
  "An agent workspace path like ~/foo or ./bar wasn't expanded, so Node's fs",
  "calls resolved it against the process's cwd rather than the workspace root.",
  "",
  "Claude Agent SDK now receives an absolute path.",
  "EOF",
  'echo "---"; git --no-pager log --oneline -1',
].join("\n");

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

  it("fails toward splitting on an unterminated single quote", () => {
    // An unterminated quote must never hide a later separator: the scanner rescans past the opening
    // quote so the top-level `&&` still splits, keeping `rm -rf ~` out of the first subcommand.
    expect(splitSubcommands("echo 'x && rm -rf ~", SHELL.BASH)).toEqual(["echo 'x", "rm -rf ~"]);
  });
});

describe("splitSubcommands (bash heredoc)", () => {
  it("treats a heredoc body as a skipped region, not one subcommand per prose line (reported bug)", () => {
    expect(splitSubcommands(REPORTED_HEREDOC_COMMAND, SHELL.BASH)).toEqual([
      "git add -A",
      "git commit -q -F - <<'EOF'",
      'echo "---"',
      "git --no-pager log --oneline -1",
    ]);
  });

  it("keeps a real separator on the opener line splitting (cat <<EOF && rm -rf /)", () => {
    const command = ["cat <<EOF && rm -rf /", "file contents", "EOF"].join("\n");
    expect(splitSubcommands(command, SHELL.BASH)).toEqual(["cat <<EOF", "rm -rf /"]);
  });

  it("treats CRLF as a single line terminator around a heredoc", () => {
    const command = ["cat <<EOF && rm -rf /", "body", "EOF"].join("\r\n");
    expect(splitSubcommands(command, SHELL.BASH)).toEqual(["cat <<EOF", "rm -rf /"]);
  });

  it("does not treat an arithmetic left shift as a heredoc (echo $((1<<3)))", () => {
    expect(splitSubcommands("echo $((1<<3)) && rm -rf /", SHELL.BASH)).toEqual(["echo $((1<<3))", "rm -rf /"]);
  });

  it("does not treat a `<<<` here-string as a heredoc", () => {
    expect(splitSubcommands("cat <<< 'hello' ; rm -rf ~", SHELL.BASH)).toEqual(["cat <<< 'hello'", "rm -rf ~"]);
  });

  it("matches a `<<-` terminator line after stripping leading tabs", () => {
    const command = ["cat <<-EOF && rm -rf /", "\tbody", "\tEOF", "echo done"].join("\n");
    expect(splitSubcommands(command, SHELL.BASH)).toEqual(["cat <<-EOF", "rm -rf /", "echo done"]);
  });

  it("consumes multiple heredoc bodies on one line in order", () => {
    const command = ["diff <<A <<B", "alpha", "A", "beta", "B", "echo done"].join("\n");
    expect(splitSubcommands(command, SHELL.BASH)).toEqual(["diff <<A <<B", "echo done"]);
  });

  it("falls back to normal splitting when a heredoc is never terminated", () => {
    // No terminator line: the body scans as ordinary text so `rm -rf /` still splits out (never hidden).
    const command = ["cat <<EOF", "line one && rm -rf /", "line two"].join("\n");
    expect(splitSubcommands(command, SHELL.BASH)).toEqual(["cat <<EOF", "line one", "rm -rf /", "line two"]);
  });

  it("ignores shell metacharacters and apostrophes inside the heredoc body", () => {
    const command = ["git commit -F - <<'EOF'", "a && b ; c | d -- it's fine", "EOF"].join("\n");
    expect(splitSubcommands(command, SHELL.BASH)).toEqual(["git commit -F - <<'EOF'"]);
  });
});

describe("splitSubcommands (bash heredoc — redirect-position gate & arithmetic)", () => {
  it("does not hide a subcommand behind a multi-line arithmetic left-shift false positive", () => {
    // Reviewer Critical: `0<<0` inside `$(( … ))` must not be read as a heredoc opener whose bogus
    // delimiter a later line matches, or the intervening `rm -rf ~` would be swallowed.
    const command = ["echo $((0<<0))", "rm -rf ~", "0"].join("\n");
    expect(splitSubcommands(command, SHELL.BASH)).toEqual(["echo $((0<<0))", "rm -rf ~", "0"]);
  });

  it("does not treat a left shift inside `(( … ))` as a heredoc", () => {
    const command = ["((x = 1<<2))", "rm -rf ~", "2"].join("\n");
    expect(splitSubcommands(command, SHELL.BASH)).toEqual(["((x = 1<<2))", "rm -rf ~", "2"]);
  });

  it("does not treat a glued left shift in a `let` expression as a heredoc", () => {
    const command = ["let y=1<<4", "rm -rf ~", "4"].join("\n");
    expect(splitSubcommands(command, SHELL.BASH)).toEqual(["let y=1<<4", "rm -rf ~", "4"]);
  });

  it("suppresses opener detection for a spaced left shift inside arithmetic", () => {
    // Whitespace before `<<` passes the redirect-position gate, so arithmetic depth is what suppresses it.
    const command = ["echo $(( 1 << 2 ))", "rm -rf ~", "2"].join("\n");
    expect(splitSubcommands(command, SHELL.BASH)).toEqual(["echo $(( 1 << 2 ))", "rm -rf ~", "2"]);
  });

  it("keeps arithmetic non-opaque to separators (a real command inside still splits)", () => {
    expect(splitSubcommands("$((cd x && rm -rf /))", SHELL.BASH)).toEqual(["$((cd x", "rm -rf /))"]);
  });

  it("does not hide a subcommand behind redundant grouping parens inside arithmetic", () => {
    // The depth counter only moves on adjacent paren pairs; a single grouping `(` must not perturb it.
    const command = ["echo $(( (1<<2) + 3 ))", "rm -rf ~", "3"].join("\n");
    expect(splitSubcommands(command, SHELL.BASH)).toEqual(["echo $(( (1<<2) + 3 ))", "rm -rf ~", "3"]);
  });

  it("over-splits rather than hides a glued or fd-numbered heredoc opener", () => {
    expect(splitSubcommands(["cat<<EOF", "body", "EOF"].join("\n"), SHELL.BASH)).toEqual(["cat<<EOF", "body", "EOF"]);
    expect(splitSubcommands(["cat 2<<EOF", "body", "EOF"].join("\n"), SHELL.BASH)).toEqual([
      "cat 2<<EOF",
      "body",
      "EOF",
    ]);
  });

  it("fails closed rather than auto-approving a command hidden by an arithmetic false positive", () => {
    const command = ["echo $((0<<0))", "rm -rf ~", "0"].join("\n");
    expect(matchesCommandRules(command, ["echo *"], SHELL.BASH)).toBe(false);
  });
});

describe("deriveCommandRules (bash heredoc)", () => {
  it("derives exactly the four rules for the reported command, under the cap", () => {
    expect(deriveCommandRules(REPORTED_HEREDOC_COMMAND, SHELL.BASH)).toEqual([
      "git add -A *",
      "git commit -q -F - <<'EOF' *",
      'echo "---" *',
      "git --no-pager log --oneline -1 *",
    ]);
  });
});

describe("matchesCommandRules (bash heredoc)", () => {
  it("auto-approves the reported heredoc commit against its own derived rules", () => {
    expect(
      matchesCommandRules(REPORTED_HEREDOC_COMMAND, deriveCommandRules(REPORTED_HEREDOC_COMMAND, SHELL.BASH), SHELL.BASH)
    ).toBe(true);
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

  it("fails toward splitting on an unterminated quote", () => {
    expect(splitSubcommands('echo "x ; rm y', SHELL.POWERSHELL)).toEqual(['echo "x', "rm y"]);
  });

  it("splits a realistic multi-line pipeline into one subcommand per cmdlet", () => {
    const command = [
      "Get-Service |",
      "Where-Object { $_.Status -eq 'Running' } |",
      "Select-Object -Property DisplayName, Status",
    ].join("\n");
    expect(splitSubcommands(command, SHELL.POWERSHELL)).toEqual([
      "Get-Service",
      "Where-Object { $_.Status -eq 'Running' }",
      "Select-Object -Property DisplayName, Status",
    ]);
  });

  it("splits a variable assignment then statement on the top-level semicolon", () => {
    expect(splitSubcommands("$files = Get-ChildItem -Recurse; Remove-Item $files", SHELL.POWERSHELL)).toEqual([
      "$files = Get-ChildItem -Recurse",
      "Remove-Item $files",
    ]);
  });

  it("keeps separators inside a script block internal, not top-level", () => {
    expect(splitSubcommands("Get-ChildItem | ForEach-Object { $x = $_; Remove-Item $x }", SHELL.POWERSHELL)).toEqual([
      "Get-ChildItem",
      "ForEach-Object { $x = $_; Remove-Item $x }",
    ]);
    expect(splitSubcommands("Get-Content log | ForEach-Object { $_ | Out-Host }", SHELL.POWERSHELL)).toEqual([
      "Get-Content log",
      "ForEach-Object { $_ | Out-Host }",
    ]);
  });

  it("respects nested script blocks and quotes inside a block", () => {
    expect(
      splitSubcommands("Get-Process | ForEach-Object { if ($_.CPU -gt 10) { Stop-Process $_ } }", SHELL.POWERSHELL)
    ).toEqual(["Get-Process", "ForEach-Object { if ($_.CPU -gt 10) { Stop-Process $_ } }"]);
    expect(splitSubcommands("Get-ChildItem | Where-Object { $_.Name -eq '}' }", SHELL.POWERSHELL)).toEqual([
      "Get-ChildItem",
      "Where-Object { $_.Name -eq '}' }",
    ]);
  });

  it("fails toward splitting when a script block is never closed", () => {
    // Unbalanced `{`: the inner `;` must still split so `rm -rf ~` cannot hide inside the block.
    expect(splitSubcommands("ForEach-Object { Remove-Item $_ ; rm -rf ~", SHELL.POWERSHELL)).toEqual([
      "ForEach-Object { Remove-Item $_",
      "rm -rf ~",
    ]);
  });

  it("does not treat `{ }` as a block under Bash (brace group separators stay top-level)", () => {
    // Bash `{ …; …; }` is a command group whose `;` separates real commands — must NOT be grouped.
    expect(splitSubcommands("{ echo hi ; rm -rf / ; }", SHELL.BASH)).toEqual(["{ echo hi", "rm -rf /", "}"]);
  });
});

describe("splitSubcommands (powershell here-string)", () => {
  it("treats a here-string body with a lone apostrophe as one opaque region", () => {
    const hereString = ["$msg = @'", "Node's process is running", "'@"].join("\n");
    const command = [hereString, "Remove-Item x"].join("\n");
    expect(splitSubcommands(command, SHELL.POWERSHELL)).toEqual([hereString, "Remove-Item x"]);
  });

  it("does not split on a separator inside a double-quoted here-string body", () => {
    const hereString = ['$msg = @"', "value ; danger", '"@'].join("\n");
    const command = [hereString, "Remove-Item x"].join("\n");
    expect(splitSubcommands(command, SHELL.POWERSHELL)).toEqual([hereString, "Remove-Item x"]);
  });

  it("falls back to splitting when a here-string is never closed", () => {
    // No `'@` line: the body scans as ordinary text so `Remove-Item y` still splits out (never hidden).
    const command = ["$msg = @'", "line ; Remove-Item y", "no terminator"].join("\n");
    expect(splitSubcommands(command, SHELL.POWERSHELL)).toEqual([
      "$msg = @'",
      "line",
      "Remove-Item y",
      "no terminator",
    ]);
  });
});

describe("deriveCommandRules (powershell here-string)", () => {
  it("derives a prefix covering the whole here-string rather than cutting into it", () => {
    const command = ["$msg = @'", "it's ; risky", "'@"].join("\n");
    expect(deriveCommandRules(command, SHELL.POWERSHELL)).toEqual([`${command} *`]);
    expect(matchesCommandRules(command, deriveCommandRules(command, SHELL.POWERSHELL), SHELL.POWERSHELL)).toBe(true);
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

  it("derives one rule per cmdlet for a realistic PowerShell pipeline, keeping the whole script block", () => {
    const command = "Get-Service | Where-Object { $_.Status -eq 'Running' } | Select-Object -Property DisplayName";
    expect(deriveCommandRules(command, SHELL.POWERSHELL)).toEqual([
      "Get-Service *",
      "Where-Object { $_.Status -eq 'Running' } *",
      "Select-Object -Property DisplayName *",
    ]);
  });

  it("keeps a PowerShell assignment prefix literal rather than broadening to the right-hand command", () => {
    // Stripping `$files =` to derive `Get-ChildItem *` would broaden the grant; the specific rule is
    // safer and still self-matches when the same assignment recurs.
    expect(deriveCommandRules("$files = Get-ChildItem -Recurse", SHELL.POWERSHELL)).toEqual([
      "$files = Get-ChildItem *",
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

  it("approves a PowerShell pipeline with a script block against its own derived rules", () => {
    const command = "Get-Service | Where-Object { $_.Status -eq 'Running' } | Select-Object -Property Name";
    expect(matchesCommandRules(command, deriveCommandRules(command, SHELL.POWERSHELL), SHELL.POWERSHELL)).toBe(true);
  });

  it("does not auto-approve a command hidden inside an unbalanced PowerShell block", () => {
    // The block never closes, so `rm -rf ~` splits out as its own subcommand; a grant covering only
    // the ForEach-Object cmdlet leaves it unmatched and ALL mode fails closed.
    expect(
      matchesCommandRules("ForEach-Object { Remove-Item $_ ; rm -rf ~", ["ForEach-Object *"], SHELL.POWERSHELL)
    ).toBe(false);
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
