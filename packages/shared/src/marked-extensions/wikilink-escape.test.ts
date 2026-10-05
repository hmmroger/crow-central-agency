import { describe, expect, it } from "vitest";
import {
  escapeWikilinkTarget,
  findWikilinkEscapeOffsets,
  isEscapableWikilinkChar,
  unescapeWikilinkTarget,
  WIKILINK_TARGET_CHAR_SOURCE,
} from "./wikilink-escape.js";

describe("escapeWikilinkTarget", () => {
  it("escapes brackets and backslashes", () => {
    expect(escapeWikilinkTarget("My [draft] note")).toBe("My \\[draft\\] note");
    expect(escapeWikilinkTarget("a\\b")).toBe("a\\\\b");
  });

  it("leaves plain targets and folder separators alone", () => {
    expect(escapeWikilinkTarget("trip/photo.png")).toBe("trip/photo.png");
  });
});

describe("unescapeWikilinkTarget", () => {
  it("undoes bracket and backslash escapes only", () => {
    expect(unescapeWikilinkTarget("My \\[draft\\] note")).toBe("My [draft] note");
    expect(unescapeWikilinkTarget("a\\\\b")).toBe("a\\b");
  });

  it("keeps a backslash before any other character literal", () => {
    expect(unescapeWikilinkTarget("C:\\temp\\notes")).toBe("C:\\temp\\notes");
    expect(unescapeWikilinkTarget("a\\nb")).toBe("a\\nb");
  });

  it.each(["My [draft] note", "a\\b", "ends with \\", "[[nested]]", "trip/photo.png", "\\[literal\\]"])(
    "round-trips %s",
    (target) => {
      expect(unescapeWikilinkTarget(escapeWikilinkTarget(target))).toBe(target);
    }
  );
});

describe("isEscapableWikilinkChar", () => {
  it.each(["[", "]", "\\"])("escapes %s", (char) => {
    expect(isEscapableWikilinkChar(char)).toBe(true);
  });

  it.each(["n", "t", "/", "|", "", "[]"])("leaves %s literal", (char) => {
    expect(isEscapableWikilinkChar(char)).toBe(false);
  });
});

describe("findWikilinkEscapeOffsets", () => {
  it("finds each escaping backslash, reading pairs left to right", () => {
    expect(findWikilinkEscapeOffsets("a\\[b\\]")).toEqual([1, 4]);
    expect(findWikilinkEscapeOffsets("\\\\[")).toEqual([0]);
  });

  it("skips literal backslashes", () => {
    expect(findWikilinkEscapeOffsets("C:\\temp\\notes")).toEqual([]);
  });
});

describe("WIKILINK_TARGET_CHAR_SOURCE", () => {
  const targetPattern = new RegExp(`^${WIKILINK_TARGET_CHAR_SOURCE}+$`);

  it.each(["plain", "My \\[draft\\]", "a\\\\b", "C:\\temp", "ends with \\"])("accepts %s", (target) => {
    expect(targetPattern.test(target)).toBe(true);
  });

  it.each(["bare [ bracket", "bare ] bracket", "two\nlines", "\\\\["])("rejects %s", (target) => {
    expect(targetPattern.test(target)).toBe(false);
  });
});
