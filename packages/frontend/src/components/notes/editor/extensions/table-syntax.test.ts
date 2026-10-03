import { describe, expect, it } from "vitest";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { findTableAt, findTopLevelTables, getTableLines, getTableRow, getTrailingPipeChanges } from "./table-syntax.js";
import { TABLE_ALIGNMENT, TABLE_SPAN_KIND, type ParsedTable, type TableRow } from "./table-syntax.types.js";

function createState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: markdown({ base: markdownLanguage }) });
}

function parseOnlyTable(doc: string): ParsedTable {
  const [table] = findTopLevelTables(createState(doc));

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

  it("marks inline syntax to hide and the text to style", () => {
    const [cell] = parseOnlyTable("| **b** [x](https://e.com) a\\|b<br>c |\n| - |").header.cells;

    expect(cell.spans).toEqual(
      expect.arrayContaining([
        { kind: TABLE_SPAN_KIND.MARK, from: 0, to: 2 },
        { kind: TABLE_SPAN_KIND.FORMAT, format: "StrongEmphasis", from: 2, to: 3 },
        { kind: TABLE_SPAN_KIND.LINK, url: "https://e.com", from: 7, to: 8 },
        { kind: TABLE_SPAN_KIND.MARK, from: 8, to: 24 },
        { kind: TABLE_SPAN_KIND.MARK, from: 26, to: 27 },
        { kind: TABLE_SPAN_KIND.LINE_BREAK, from: 29, to: 33 },
      ])
    );
  });

  it("keeps block syntax in a cell as literal text", () => {
    const [cell] = parseOnlyTable("| # x |\n| - |").header.cells;

    expect(cell.content).toBe("# x");
    expect(cell.spans).toEqual([]);
  });

  it("finds the table starting at a position", () => {
    const doc = "| a |\n| - |\n\n| b |\n| - |";
    const state = createState(doc);

    expect(getContents(findTableAt(state, doc.indexOf("| b"))?.header)).toEqual(["b"]);
    expect(findTableAt(state, doc.indexOf("a"))).toBeUndefined();
  });

  it("starts an indented table at the start of its header line", () => {
    const state = createState("  | a |\n  | - |");

    expect(findTopLevelTables(state)[0]?.from).toBe(0);
    expect(findTableAt(state, 0)?.header.cells[0]?.content).toBe("a");
  });

  it("leaves tables inside quotes out of the top-level tables", () => {
    expect(findTopLevelTables(createState("> | a |\n> | - |"))).toEqual([]);
  });

  it("closes only the rows that lack a trailing pipe", () => {
    const doc = "| a | b\n| - | - |\n| 1 | 2 |\n| 3 | 4";
    const changes = getTrailingPipeChanges(getTableLines(parseOnlyTable(doc)));

    expect(changes).toEqual([
      { from: doc.indexOf("\n"), insert: " |" },
      { from: doc.length, insert: " |" },
    ]);
  });

  it("closes a delimiter row that lacks a trailing pipe", () => {
    const doc = "| a | b |\n| - | -\n| 1 | 2 |";

    expect(getTrailingPipeChanges(getTableLines(parseOnlyTable(doc)))).toEqual([
      { from: doc.indexOf("\n| 1"), insert: " |" },
    ]);
  });
});
