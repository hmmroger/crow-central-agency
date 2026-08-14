import { describe, expect, it } from "vitest";
import {
  deriveNewCommandRules,
  deriveCommandRules,
  matchesCommandRules,
  splitCommandPositions,
  splitSubcommands,
  SUBCOMMAND_MATCH_MODE,
} from "./command-decomposition.js";
import { SHELL } from "./shell-grammar.js";

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

  it("does not let an `@\"`/`@'` that is not a real opener hide a following command", () => {
    // `@"` not at end-of-line is not a here-string opener; the quote must not open a multi-line scan
    // that pairs with a later `"@` and swallows the `rm`. Both quote forms must split it out.
    const doubleForm = ["echo @\"; rm -rf /", "\"@"].join("\n");
    expect(splitSubcommands(doubleForm, SHELL.POWERSHELL)).toEqual(["echo @\"", "rm -rf /", "\"@"]);
    expect(matchesCommandRules(doubleForm, ["echo *"], SHELL.POWERSHELL)).toBe(false);

    const singleForm = ["echo @'; rm -rf /", "'@"].join("\n");
    expect(splitSubcommands(singleForm, SHELL.POWERSHELL)).toEqual(["echo @'", "rm -rf /", "'@"]);
  });

  it("keeps a here-string body's leading `}` and lone apostrophe opaque inside a script block", () => {
    // findBalancedEnd now skips here-strings, which findBlockEnd did not: a `}` at the start of a body
    // line no longer closes the enclosing block early, and a lone apostrophe no longer opens a bogus
    // quote scan. The whole ForEach-Object block stays one subcommand.
    const block = ["ForEach-Object { Write-Output @'", "'", "}", "'@ ; Remove-Item $x }"].join("\n");
    const command = ["Get-Process |", block].join(" ");
    expect(splitSubcommands(command, SHELL.POWERSHELL)).toEqual(["Get-Process", block]);
  });

  it("does not misread `@(` array, `@{` hashtable, or `@var` splat as a here-string opener", () => {
    expect(splitSubcommands("Write-Output @(1, 2) ; Remove-Item x", SHELL.POWERSHELL)).toEqual([
      "Write-Output @(1, 2)",
      "Remove-Item x",
    ]);
    expect(splitSubcommands("@{ Name = 1 } ; Remove-Item y", SHELL.POWERSHELL)).toEqual([
      "@{ Name = 1 }",
      "Remove-Item y",
    ]);
    expect(splitSubcommands("$x = @args ; Remove-Item z", SHELL.POWERSHELL)).toEqual([
      "$x = @args",
      "Remove-Item z",
    ]);
  });
});

describe("deriveCommandRules (powershell here-string)", () => {
  it("derives a prefix covering the whole here-string, skipping the assignment prefix", () => {
    const command = ["$msg = @'", "it's ; risky", "'@"].join("\n");
    const rhs = ["@'", "it's ; risky", "'@"].join("\n");
    expect(deriveCommandRules(command, SHELL.POWERSHELL)).toEqual([`${rhs} *`]);
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

  it("recurses into a script block, deriving the cmdlet prefix and dropping the block's expression", () => {
    const command = "Get-Service | Where-Object { $_.Status -eq 'Running' } | Select-Object -Property DisplayName";
    expect(deriveCommandRules(command, SHELL.POWERSHELL)).toEqual([
      "Get-Service *",
      "Where-Object *",
      "Select-Object -Property DisplayName *",
    ]);
  });

  it("skips a PowerShell assignment prefix, deriving from the right-hand command", () => {
    expect(deriveCommandRules("$files = Get-ChildItem -Recurse", SHELL.POWERSHELL)).toEqual([
      "Get-ChildItem -Recurse *",
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

describe("splitCommandPositions — decompose to the commands actually being run", () => {
  it("drops the foreach header entirely, keeping only the block body as a leaf", () => {
    expect(splitCommandPositions("foreach ($file in $files) { Remove-Item $file }", SHELL.POWERSHELL)).toEqual([
      "Remove-Item $file",
    ]);
  });

  it("recurses into a Bash command substitution", () => {
    expect(splitCommandPositions("echo $(rm -rf /)", SHELL.BASH)).toEqual(["echo", "rm -rf /"]);
  });

  it("continues scanning past each closing paren for adjacent substitutions", () => {
    expect(splitCommandPositions("echo $(cmd1)$(cmd2)", SHELL.BASH)).toEqual(["echo", "cmd1", "cmd2"]);
  });

  it("recovers leaves at both levels of a nested substitution", () => {
    expect(splitCommandPositions("echo $(dirname $(pwd))", SHELL.BASH)).toEqual(["echo", "dirname", "pwd"]);
  });

  it("reaches a deeply nested command through two script blocks", () => {
    expect(
      splitCommandPositions(
        "Get-Process | ForEach-Object { if ($_.CPU -gt 10) { Stop-Process $_ } }",
        SHELL.POWERSHELL
      )
    ).toEqual(["Get-Process", "ForEach-Object", "Stop-Process $_"]);
  });

  it("skips consecutive Bash assignment prefixes", () => {
    expect(splitCommandPositions("A=1 B=2 npm run build", SHELL.BASH)).toEqual(["npm run build"]);
  });

  it("keeps the whole literal command as the leaf when only assignments remain", () => {
    expect(splitCommandPositions("A=1 B=2", SHELL.BASH)).toEqual(["A=1 B=2"]);
  });

  it("treats a whole-block segment as its command, dropping the empty enclosing prefix", () => {
    expect(splitCommandPositions("&{ Remove-Item x }", SHELL.POWERSHELL)).toEqual(["Remove-Item x"]);
  });

  it("drops a PowerShell variable-driven invocation but keeps a Bash one", () => {
    expect(splitCommandPositions("& $cmd arg", SHELL.POWERSHELL)).toEqual([]);
    expect(splitCommandPositions("$sb.Invoke()", SHELL.POWERSHELL)).toEqual([]);
    expect(splitCommandPositions("$CMD arg", SHELL.BASH)).toEqual(["$CMD arg"]);
  });

  it("leaves an unresolvable boundary literal in the enclosing leaf, never recursing", () => {
    expect(splitCommandPositions("echo $(rm -rf /", SHELL.BASH)).toEqual(["echo $(rm -rf /"]);
    expect(splitCommandPositions("echo $((1+2))", SHELL.BASH)).toEqual(["echo $((1+2))"]);
    expect(splitCommandPositions("echo `rm -rf /`", SHELL.BASH)).toEqual(["echo `rm -rf /`"]);
    expect(splitCommandPositions("ForEach-Object { Remove-Item $_", SHELL.POWERSHELL)).toEqual([
      "ForEach-Object { Remove-Item $_",
    ]);
  });

  it("recurses a PowerShell substitution wrapping a grouping paren, exposing the real command", () => {
    expect(splitCommandPositions("$((Get-Process).Count)", SHELL.POWERSHELL)).toEqual(["Get-Process"]);
    expect(splitCommandPositions("echo $((1+2))", SHELL.BASH)).toEqual(["echo $((1+2))"]);
  });

  it("returns a single leaf for a plain command and empty for empty input", () => {
    expect(splitCommandPositions("git commit -m x", SHELL.BASH)).toEqual(["git commit -m x"]);
    expect(splitCommandPositions("", SHELL.BASH)).toEqual([]);
  });
});

describe("splitCommandPositions — bare paren as a balanced region (Defect 1)", () => {
  it("recurses a grouping paren instead of mangling it into fragments and a bare `)` leaf", () => {
    expect(
      splitCommandPositions("$x = (Get-Process | Where-Object { $_.CPU -gt 1 })", SHELL.POWERSHELL)
    ).toEqual(["Get-Process", "Where-Object"]);
  });

  it("recurses a grouping paren after an assignment, dropping the assignment prefix", () => {
    expect(splitCommandPositions("$firstAuthor = ($authors | Select-Object -First 1)", SHELL.POWERSHELL)).toEqual([
      "Select-Object -First 1",
    ]);
  });

  it("restores deny reach over a command hidden behind a grouping paren", () => {
    expect(
      matchesCommandRules("(Get-Content a.txt | Remove-Item)", ["Remove-Item *"], SHELL.POWERSHELL, SUBCOMMAND_MATCH_MODE.ANY)
    ).toBe(true);
  });

  it("keeps a glued argument-list paren inline as one expression leaf, then drops it", () => {
    expect(splitCommandPositions("$_.Groups[1].Value.Trim()", SHELL.POWERSHELL)).toEqual([]);
    expect(splitCommandPositions(String.raw`[regex]::Matches($b, '-\s+([^(]+)\(')`, SHELL.POWERSHELL)).toEqual([]);
  });

  it("recurses a Bash subshell's interior into its own leaves", () => {
    expect(splitCommandPositions("(cd x && rm -rf y)", SHELL.BASH)).toEqual(["cd x", "rm -rf y"]);
  });

  it("consumes a matched `(` so its `)` is never read as a separator", () => {
    expect(splitSubcommands("foo() { echo hi; }", SHELL.BASH)).toEqual(["foo() { echo hi", "}"]);
    expect(splitCommandPositions("diff <(sort a) <(sort b)", SHELL.BASH)).toEqual(["diff <(sort a) <(sort b)"]);
  });

  it("falls toward splitting on an unbalanced bare paren, hiding no command", () => {
    expect(splitSubcommands("(cd x && rm -rf ~", SHELL.BASH)).toEqual(["(cd x", "rm -rf ~"]);
  });
});

describe("splitCommandPositions — substitutions inside interpolating quotes (Defect 2)", () => {
  it("recurses a `$( … )` inside a double-quoted region while keeping the quoted text inline", () => {
    expect(splitCommandPositions('Write-Host "$(Remove-Item x)"', SHELL.POWERSHELL)).toEqual([
      "Remove-Item x",
      'Write-Host "$(Remove-Item x)"',
    ]);
    expect(splitCommandPositions('echo "$(rm -rf ~)"', SHELL.BASH)).toEqual(["rm -rf ~", 'echo "$(rm -rf ~)"']);
  });

  it("restores deny reach over a command hidden in a double-quoted substitution", () => {
    expect(
      matchesCommandRules('Write-Host "$(Remove-Item x)"', ["Remove-Item *"], SHELL.POWERSHELL, SUBCOMMAND_MATCH_MODE.ANY)
    ).toBe(true);
    expect(matchesCommandRules('echo "$(rm -rf ~)"', ["rm *"], SHELL.BASH, SUBCOMMAND_MATCH_MODE.ANY)).toBe(true);
  });

  it("fails closed for the enclosing grant alone, since the substitution is its own obligation", () => {
    expect(matchesCommandRules('echo "$(rm -rf ~)"', ["echo *"], SHELL.BASH)).toBe(false);
  });

  it("keeps a single-quoted region opaque — no interpolation, no recursion", () => {
    expect(splitCommandPositions("echo '$(rm -rf ~)'", SHELL.BASH)).toEqual(["echo '$(rm -rf ~)'"]);
    expect(matchesCommandRules("echo '$(rm -rf ~)'", ["rm *"], SHELL.BASH, SUBCOMMAND_MATCH_MODE.ANY)).toBe(false);
  });

  it("does not read an escaped `$(` inside a double-quoted region as a substitution", () => {
    expect(splitCommandPositions(String.raw`echo "\$(rm -rf ~)"`, SHELL.BASH)).toEqual([String.raw`echo "\$(rm -rf ~)"`]);
  });

  it("keeps a PowerShell here-string body opaque — no substitution recursion", () => {
    const command = ['$msg = @"', "$(Remove-Item x)", '"@'].join("\n");
    const rhs = ['@"', "$(Remove-Item x)", '"@'].join("\n");
    expect(splitCommandPositions(command, SHELL.POWERSHELL)).toEqual([rhs]);
    expect(matchesCommandRules(command, ["Remove-Item *"], SHELL.POWERSHELL, SUBCOMMAND_MATCH_MODE.ANY)).toBe(false);
  });
});

describe("splitCommandPositions — Bash reserved words and case patterns (Defect 3)", () => {
  it("strips a leading command-list keyword so the delimited command is the leaf", () => {
    expect(splitCommandPositions("if grep -q x f; then rm -rf y; fi", SHELL.BASH)).toEqual(["grep -q x f", "rm -rf y"]);
    expect(splitCommandPositions("while read l; do echo $l; done", SHELL.BASH)).toEqual(["read l", "echo $l"]);
  });

  it("restores deny reach over a body hidden behind a keyword", () => {
    expect(matchesCommandRules("if grep -q x f; then rm -rf y; fi", ["rm *"], SHELL.BASH, SUBCOMMAND_MATCH_MODE.ANY)).toBe(
      true
    );
  });

  it("does not auto-approve a loop body from a keyword-stripped grant alone", () => {
    expect(matchesCommandRules("while rm -rf /; do echo hi; done", ["echo *"], SHELL.BASH)).toBe(false);
    expect(
      matchesCommandRules(
        "while rm -rf /; do echo hi; done",
        deriveCommandRules("while rm -rf /; do echo hi; done", SHELL.BASH),
        SHELL.BASH
      )
    ).toBe(true);
  });

  it("splits a case pattern body out and drops the header instead of trapping the body", () => {
    expect(splitCommandPositions("case $x in a) rm -rf /;; esac", SHELL.BASH)).toEqual(["rm -rf /"]);
    expect(deriveCommandRules("case $x in a) rm -rf /;; esac", SHELL.BASH)).toEqual(["rm -rf / *"]);
    expect(matchesCommandRules("case $x in a) rm -rf /;; esac", ["rm *"], SHELL.BASH, SUBCOMMAND_MATCH_MODE.ANY)).toBe(
      true
    );
  });

  it("drops a bare reserved word or word-list header to zero leaves, failing closed", () => {
    expect(splitCommandPositions("done", SHELL.BASH)).toEqual([]);
    expect(splitCommandPositions("for f in a b c", SHELL.BASH)).toEqual([]);
    expect(matchesCommandRules("done", ["done *"], SHELL.BASH)).toBe(false);
  });

  it("still keeps a bare assignment subcommand as its own leaf", () => {
    expect(splitCommandPositions("A=1 B=2", SHELL.BASH)).toEqual(["A=1 B=2"]);
  });
});

describe("splitCommandPositions — glued tails and non-interpolating substitutions", () => {
  it("drops a trailing Bash `}` brace-group terminator instead of deriving a junk rule", () => {
    expect(splitCommandPositions("foo() { echo hi; }", SHELL.BASH)).toEqual(["foo() { echo hi"]);
    expect(deriveCommandRules("foo() { echo hi; }", SHELL.BASH)).toEqual(["foo() { echo *"]);
  });

  it("still exposes a command inside a Bash brace group for deny", () => {
    expect(matchesCommandRules("{ echo hi ; rm -rf / ; }", ["rm *"], SHELL.BASH, SUBCOMMAND_MATCH_MODE.ANY)).toBe(true);
  });

  it("drops expression continuation glued to a recursed grouping paren's close", () => {
    expect(splitCommandPositions("(Get-Date).Year", SHELL.POWERSHELL)).toEqual(["Get-Date"]);
    expect(splitCommandPositions("$n = (Get-ChildItem).Count", SHELL.POWERSHELL)).toEqual(["Get-ChildItem"]);
    expect(deriveCommandRules("(Get-Date).Year", SHELL.POWERSHELL)).toEqual(["Get-Date *"]);
  });

  it("still exposes the real command behind a glued member access for deny", () => {
    expect(
      matchesCommandRules("(Remove-Item x).Count", ["Remove-Item *"], SHELL.POWERSHELL, SUBCOMMAND_MATCH_MODE.ANY)
    ).toBe(true);
  });

  it("keeps a PowerShell dot-source invocation as a runnable leaf", () => {
    expect(splitCommandPositions(String.raw`.\script.ps1`, SHELL.POWERSHELL)).toEqual([String.raw`.\script.ps1`]);
    expect(splitCommandPositions(". ./script.ps1", SHELL.POWERSHELL)).toEqual([". ./script.ps1"]);
  });

  it("does not recurse a PowerShell `@( … )` inside a double-quoted string literal", () => {
    expect(splitCommandPositions('Write-Host "@(Remove-Item x)"', SHELL.POWERSHELL)).toEqual([
      'Write-Host "@(Remove-Item x)"',
    ]);
    expect(
      matchesCommandRules(
        'Write-Host "@(Remove-Item x)"',
        ["Remove-Item *"],
        SHELL.POWERSHELL,
        SUBCOMMAND_MATCH_MODE.ANY
      )
    ).toBe(false);
  });
});

describe("deriveCommandRules — command position decomposition", () => {
  it("derives only the block command, dropping the foreach header entirely", () => {
    expect(deriveCommandRules("foreach ($file in $files) { Remove-Item $file }", SHELL.POWERSHELL)).toEqual([
      "Remove-Item *",
    ]);
  });

  it("derives from the right-hand command after skipping an assignment", () => {
    expect(deriveCommandRules("$files = Get-ChildItem -Recurse", SHELL.POWERSHELL)).toEqual(["Get-ChildItem -Recurse *"]);
    expect(deriveCommandRules("A=1 B=2 npm run build", SHELL.BASH)).toEqual(["npm run build *"]);
  });

  it("derives the real command from a substitution wrapping a grouping paren", () => {
    expect(deriveCommandRules("$((Get-Process).Count)", SHELL.POWERSHELL)).toEqual(["Get-Process *"]);
  });

  it("strips an assignment prefix whose right-hand side is a script block", () => {
    // The RHS block recurses as its own leaf, leaving only `$x =`; that bare assignment must not
    // become a junk `$x = *` rule alongside the real command from the block.
    expect(deriveCommandRules("$x = { Remove-Item y }", SHELL.POWERSHELL)).toEqual(["Remove-Item y *"]);
  });

  it("derives one rule per command through nested substitutions and blocks", () => {
    expect(deriveCommandRules("echo $(rm -rf /)", SHELL.BASH)).toEqual(["echo *", "rm -rf / *"]);
    expect(deriveCommandRules("Get-Content log | ForEach-Object { $_ | Out-Host }", SHELL.POWERSHELL)).toEqual([
      "Get-Content log *",
      "ForEach-Object *",
      "Out-Host *",
    ]);
  });

  it("stops the prefix at the first $-bearing token", () => {
    expect(deriveCommandRules("Remove-Item $file", SHELL.POWERSHELL)).toEqual(["Remove-Item *"]);
    expect(deriveCommandRules("Remove-Item $other", SHELL.POWERSHELL)).toEqual(["Remove-Item *"]);
    expect(deriveCommandRules("git commit -m x", SHELL.BASH)).toEqual(["git commit -m x *"]);
  });

  it("drops a PowerShell expression leaf whose first token is not an invocation", () => {
    expect(deriveCommandRules("$_.Status -eq 'Running'", SHELL.POWERSHELL)).toEqual([]);
    expect(deriveCommandRules("$sb.Invoke()", SHELL.POWERSHELL)).toEqual([]);
  });

  it("strips loop scaffolding down to the commands the keywords delimit", () => {
    expect(deriveCommandRules("while rm -rf /; do echo hi; done", SHELL.BASH)).toEqual(["rm -rf / *", "echo hi *"]);
    expect(deriveCommandRules("for f in *.ts; do rm $f; done", SHELL.BASH)).toEqual(["rm *"]);
  });

  it("leaves an unresolvable boundary literal and still derives an approvable rule", () => {
    expect(deriveCommandRules("echo $((1+2))", SHELL.BASH)).toEqual(["echo *"]);
    expect(deriveCommandRules("echo $(rm -rf /", SHELL.BASH)).toEqual(["echo *"]);
  });
});

const POWERSHELL_MOTIVATING_COMMAND = [
  String.raw`$c = Get-Content 'C:\logs\out.txt' -Raw`,
  String.raw`$blocks = $c -split '(?=Thread #)'`,
  String.raw`foreach ($b in $blocks) {`,
  String.raw`  if ($b -match 'Thread #(\d+)\s*\[([^\]]+)\]') {`,
  String.raw`    $id = $Matches[1]; $status = $Matches[2]`,
  String.raw`    $authors = [regex]::Matches($b, '-\s+([^(]+)\(') | ForEach-Object { $_.Groups[1].Value.Trim() }`,
  String.raw`    $firstAuthor = ($authors | Select-Object -First 1)`,
  String.raw`    "$id | $status | $firstAuthor"`,
  String.raw`  }`,
  String.raw`}`,
].join("\n");

const BASH_MOTIVATING_COMMAND =
  'cd /repo/src && for f in a.ts b.ts c.ts; do echo "===== $f"; grep -n "x" "$f" | head -30; done';

describe("the motivating commands decompose to real invocations only", () => {
  it("reduces the PowerShell command to the cmdlets that actually run", () => {
    expect(splitCommandPositions(POWERSHELL_MOTIVATING_COMMAND, SHELL.POWERSHELL)).toEqual([
      String.raw`Get-Content 'C:\logs\out.txt' -Raw`,
      "ForEach-Object",
      "Select-Object -First 1",
    ]);
    expect(deriveCommandRules(POWERSHELL_MOTIVATING_COMMAND, SHELL.POWERSHELL)).toEqual([
      String.raw`Get-Content 'C:\logs\out.txt' -Raw *`,
      "ForEach-Object *",
      "Select-Object -First 1 *",
    ]);
  });

  it("reduces the Bash command to four leaves within the rule cap", () => {
    expect(splitCommandPositions(BASH_MOTIVATING_COMMAND, SHELL.BASH)).toEqual([
      "cd /repo/src",
      'echo "===== $f"',
      'grep -n "x" "$f"',
      "head -30",
    ]);
    expect(deriveCommandRules(BASH_MOTIVATING_COMMAND, SHELL.BASH)).toEqual([
      "cd /repo/src *",
      "echo *",
      'grep -n "x" *',
      "head -30 *",
    ]);
  });
});

describe("matchesCommandRules — command position decomposition", () => {
  it("auto-approves a script-shaped command against its own decomposed rules", () => {
    const command = "foreach ($file in $files) { Remove-Item $file }";
    expect(matchesCommandRules(command, deriveCommandRules(command, SHELL.POWERSHELL), SHELL.POWERSHELL)).toBe(true);
    const nested = "Get-Process | ForEach-Object { if ($_.CPU -gt 10) { Stop-Process $_ } }";
    expect(matchesCommandRules(nested, deriveCommandRules(nested, SHELL.POWERSHELL), SHELL.POWERSHELL)).toBe(true);
  });

  it("matches a $-wildcarded rule against a different variable value", () => {
    expect(matchesCommandRules("Remove-Item $other", ["Remove-Item *"], SHELL.POWERSHELL)).toBe(true);
  });

  it("exposes a command hidden inside a substitution, so it must match its own rule", () => {
    // The prior string-offset-0 rule auto-approved `echo $(rm -rf /)` under `Bash(echo *)`; now the
    // `rm -rf /` is its own leaf and fails closed unless separately granted.
    expect(matchesCommandRules("echo $(rm -rf /)", ["echo *"], SHELL.BASH)).toBe(false);
    expect(matchesCommandRules("echo $(rm -rf /)", ["echo *", "rm -rf *"], SHELL.BASH)).toBe(true);
  });

  it("fails closed on a dangerous block body under a benign block's rules", () => {
    const benign = deriveCommandRules("foreach ($file in $files) { Remove-Item $file }", SHELL.POWERSHELL);
    expect(matchesCommandRules("foreach ($file in $files) { Start-Process calc.exe }", benign, SHELL.POWERSHELL)).toBe(
      false
    );
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
