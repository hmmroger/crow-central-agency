import { describe, expect, it } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { SYNTAX_NODE } from "../markdown-syntax.types.js";
import { getTableRow, parseTable } from "./table-syntax.js";
import { TABLE_ALIGNMENT, type ParsedTable, type TableRow } from "./table-syntax.types.js";

function createState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: markdown({ base: markdownLanguage }) });
}

function parseOnlyTable(doc: string): ParsedTable {
  const state = createState(doc);
  const tableNode = syntaxTree(state).topNode.getChild(SYNTAX_NODE.TABLE);
  const table = tableNode ? parseTable(state, tableNode) : undefined;

  if (!table) {
    throw new Error("no table parsed");
  }

  return table;
}

function getContents(row: TableRow | undefined): string[] {
  return row ? row.cells.map((cell) => cell.content) : [];
}

describe("table parsing", () => {
  it("reads the header, alignments and body rows", () => {
    const doc = "intro\n\n| a | b | c |\n| :-- | :-: | --: |\n| 1 | **2** | 3 |";
    const table = parseOnlyTable(doc);

    expect(table.from).toBe(doc.indexOf("| a"));
    expect(table.to).toBe(doc.length);
    expect(getContents(table.header)).toEqual(["a", "b", "c"]);
    expect(getContents(getTableRow(table, 1))).toEqual(["1", "**2**", "3"]);
    expect(table.delimiter.cells.map((cell) => cell.alignment)).toEqual([
      TABLE_ALIGNMENT.LEFT,
      TABLE_ALIGNMENT.CENTER,
      TABLE_ALIGNMENT.RIGHT,
    ]);
  });

  it("records each cell's source range", () => {
    const doc = "| a | bc |\n| - | - |";
    const [first, second] = parseOnlyTable(doc).header.cells;

    expect(doc.slice(first.from, first.to)).toBe("a");
    expect(doc.slice(second.from, second.to)).toBe("bc");
  });

  it("reads rows without outer pipes", () => {
    const table = parseOnlyTable("a | b\n--- | ---\n1 | 2");

    expect(getContents(table.header)).toEqual(["a", "b"]);
    expect(getContents(getTableRow(table, 1))).toEqual(["1", "2"]);
    expect(table.header.hasTrailingPipe).toBe(false);
  });

  it("places an empty cell after the space that follows its pipe", () => {
    const doc = "| a | b |\n| - | - |\n|   | x |";
    const [empty] = parseOnlyTable(doc).rows[0].cells;

    expect(empty.from).toBe(empty.to);
    expect(empty.from).toBe(doc.lastIndexOf("|   |") + 2);
  });

  it("keeps block syntax in a cell as literal text", () => {
    const [cell] = parseOnlyTable("| # x |\n| - |").header.cells;

    expect(cell.content).toBe("# x");
  });

  it("starts an indented table at the start of its header line", () => {
    expect(parseOnlyTable("  | a |\n  | - |").from).toBe(0);
  });

  it("records which lines lack a trailing pipe", () => {
    const table = parseOnlyTable("| a | b\n| - | -\n| 1 | 2 |");

    expect([table.header, table.delimiter].concat(table.rows).map((line) => line.hasTrailingPipe)).toEqual([
      false,
      false,
      true,
    ]);
  });
});
