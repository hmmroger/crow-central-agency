import { describe, expect, it } from "vitest";
import { trimParseableRules, resolveRulesToPersist } from "./permission-rule-override.js";

describe("trimParseableRules", () => {
  it("keeps parseable rules and drops malformed ones", () => {
    const rules = ["Write", "Bash(npm run *)", "mcp__crow-artifacts__*", "Bash(ls", "(foo)", "", "   "];

    expect(trimParseableRules(rules)).toEqual(["Write", "Bash(npm run *)", "mcp__crow-artifacts__*"]);
  });

  it("trims surrounding whitespace from valid rules", () => {
    const rules = ["  Bash(ls *)  ", "mcp__crow-artifacts__write_artifact"];

    expect(trimParseableRules(rules)).toEqual(["Bash(ls *)", "mcp__crow-artifacts__write_artifact"]);
  });

  it("trims only, preserving internal spacing and casing", () => {
    expect(trimParseableRules([" Bash(NPM run  Build *) "])).toEqual(["Bash(NPM run  Build *)"]);
  });

  it("returns an empty array when every rule is malformed or whitespace-only", () => {
    expect(trimParseableRules(["Bash(ls", "", "   "])).toEqual([]);
  });
});

describe("resolveRulesToPersist", () => {
  const derived = ["Bash(npm run build *)"];

  it("prefers the client-supplied override over the derived rules", () => {
    const override = ["Bash(npm run *)"];

    expect(resolveRulesToPersist(override, derived)).toBe(override);
  });

  it("uses an empty override in place of the derived rules", () => {
    expect(resolveRulesToPersist([], derived)).toEqual([]);
  });

  it("falls back to the derived rules when the override is absent", () => {
    expect(resolveRulesToPersist(undefined, derived)).toBe(derived);
  });
});
