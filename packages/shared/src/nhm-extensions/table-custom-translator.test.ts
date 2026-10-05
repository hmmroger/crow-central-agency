import { describe, expect, it } from "vitest";
import { PostProcessResult, type TranslatorConfig, type TranslatorContext } from "node-html-markdown";
import type { ElementNode } from "node-html-markdown/dist/nodes.js";
import type { NodeMetadataMap } from "node-html-markdown/dist/visitor.js";
import { getTableCustomTranslator } from "./table-custom-translator.js";

interface PostprocessInput {
  content: string;
  caption?: string;
}

// Visitor and ElementNode carry private members and parser internals, so a structural stub needs a cast.
const stubNode = {} as unknown as ElementNode;
const stubContext = {
  visitor: { instance: { tableTranslators: {} } },
  options: {},
  node: stubNode,
} as unknown as TranslatorContext;

function getTableConfig(maxSeparatorCount?: number): TranslatorConfig {
  const tableTranslator = getTableCustomTranslator(maxSeparatorCount).table;
  return typeof tableTranslator === "function" ? tableTranslator(stubContext) : tableTranslator;
}

function runPostprocess({ content, caption }: PostprocessInput, maxSeparatorCount?: number) {
  const nodeMetadata: NodeMetadataMap = new Map();
  if (caption) {
    nodeMetadata.set(stubNode, { tableMeta: { node: stubNode, caption } });
  }

  return getTableConfig(maxSeparatorCount).postprocess?.({ ...stubContext, nodeMetadata, content });
}

describe("getTableCustomTranslator", () => {
  it("rebuilds a table with a header separator and padded cells", () => {
    const content = "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n";

    expect(runPostprocess({ content })).toBe(
      "| Name  | Age |\n" + "| ----- | --- |\n" + "| ---   | --- |\n" + "| Alice | 30  |\n"
    );
  });

  it("prepends the caption from node metadata", () => {
    expect(runPostprocess({ content: "| A |", caption: "Caption" })).toBe("Caption\n| A   |\n| --- |\n");
  });

  it("handles rows without leading or trailing pipes", () => {
    expect(runPostprocess({ content: "Left | Right\nfoo | bar" })).toBe(
      "| Left | Right |\n" + "| ---- | ----- |\n" + "| foo  | bar   |\n"
    );
  });

  it("caps column padding at the max separator count", () => {
    expect(runPostprocess({ content: "| abcdefgh |" }, 5)).toBe("| abcdefgh |\n| ----- |\n");
  });

  it("removes the node when the content has no lines", () => {
    expect(runPostprocess({ content: "\n  \n" })).toBe(PostProcessResult.RemoveNode);
  });

  it("strips a leading pipe preceded by whitespace", () => {
    expect(runPostprocess({ content: "  | foo | bar |\n" })).toBe("| foo | bar |\n| --- | --- |\n");
  });

  it("processes a line with a very long whitespace run in linear time", () => {
    const content = "| a" + " ".repeat(100_000) + "b";
    const startTime = performance.now();

    const result = runPostprocess({ content });

    expect(performance.now() - startTime).toBeLessThan(1000);
    expect(result).toContain("| a" + " ".repeat(100_000) + "b |");
  });
});
