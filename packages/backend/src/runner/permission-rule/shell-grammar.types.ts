export interface ShellSyntax {
  /** Escapes the next char outside quotes and inside double quotes (Bash `\`, PowerShell backtick). */
  readonly escapeChar: string;
  /** Whether a doubled single quote (`''`) is an embedded quote that keeps the string open. */
  readonly singleQuoteEmbedded: boolean;
  /** Whether a doubled double quote (`""`) is an embedded quote that keeps the string open. */
  readonly doubleQuoteEmbedded: boolean;
  /**
   * Whether `{ … }` is an opaque script block whose inner separators are internal, not top-level
   * (PowerShell `Where-Object { … }`, `if (…) { … }`). Off for Bash, where `{ …; …; }` is a brace
   * group whose `;` separates real commands — grouping there would hide a subcommand.
   */
  readonly scriptBlock: boolean;
  /**
   * Whether `<<`/`<<-` opens a heredoc whose body (up to a terminator line) is a skipped region, not
   * shell text. Bash only — a heredoc body would otherwise decompose as one subcommand per prose line.
   */
  readonly hereDoc: boolean;
  /**
   * Whether `((`/`$((` … `))` is an arithmetic context. Tracked as a nesting depth only to suppress
   * heredoc-operator detection inside it (a `1 << 2` left shift is not a redirect); separators inside
   * are still top-level, so the region is never opaque and cannot hide a command. Bash only.
   */
  readonly arithmetic: boolean;
  /**
   * Whether `@' … '@` / `@" … "@` is a here-string: an inline opaque region from the opener (last
   * token on its line) to a closing `'@`/`"@` that begins a line. Skipped like a quote in both the
   * separator scan and token scan so a lone apostrophe in the body cannot fragment it. PowerShell only.
   */
  readonly hereString: boolean;
  /** Whether `$( … )` recurses as its own command list. Both shells; a Bash `$((` is arithmetic, not this. */
  readonly commandSubstitution: boolean;
  /** Whether `@( … )` recurses like a command substitution. PowerShell only. */
  readonly arraySubexpression: boolean;
  /** Whether leading `NAME=value` tokens are assignment prefixes to skip. Bash only. */
  readonly bashAssignmentPrefix: boolean;
  /** Whether a leading `$var`/`$env:NAME` before `=`/`+=` is an assignment prefix to skip. PowerShell only. */
  readonly variableAssignmentPrefix: boolean;
  /**
   * Reserved words that introduce a command list; a leading one is stripped so the command it delimits
   * becomes the leaf (`then rm -rf y` → `rm -rf y`). Empty for PowerShell, which delimits with braces.
   */
  readonly commandListKeywords: readonly string[];
  /**
   * Reserved words a leaf may reduce to but that run nothing, so such a leaf is dropped: Bash loop
   * terminators (`done`, `fi`, `esac`) and PowerShell block keywords left bare (`if`, `foreach`, …).
   */
  readonly standaloneKeywords: readonly string[];
  /**
   * Reserved words heading a word-list construct (`for`, `select`, `case`); a leaf whose first token is
   * one of these runs nothing and is dropped. Bash only.
   */
  readonly wordListHeaderKeywords: readonly string[];
  /**
   * First-token opener characters that mark a leaf as a non-executing expression to drop (`$`, `"`,
   * `'`, `[`). PowerShell only — in Bash a `$CMD arg` leaf genuinely executes.
   */
  readonly expressionLeafOpeners: readonly string[];
  /** Whether a leaf whose first token starts with a digit is a non-executing expression to drop. PowerShell only. */
  readonly expressionLeafDropsLeadingDigit: boolean;
  /**
   * Whether an unmatched `)` is a separator: a case-pattern terminator, since matched `( … )` regions
   * are already consumed as balanced. Bash only — PowerShell delimits `switch` with braces.
   */
  readonly unmatchedCloseParenSeparator: boolean;
  readonly twoCharSeparators: readonly string[];
  readonly singleCharSeparators: readonly string[];
}

export interface SeparatorPosition {
  readonly index: number;
  readonly length: number;
}

export interface HereDocOpener {
  readonly delimiter: string;
  readonly stripTabs: boolean;
}

export interface HereDocOpenerMatch {
  readonly opener: HereDocOpener;
  readonly nextIndex: number;
}

export interface TokenSpan {
  readonly start: number;
  readonly end: number;
}
