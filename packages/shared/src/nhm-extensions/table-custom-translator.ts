import type { TranslatorConfigObject } from "node-html-markdown";
import type { Visitor } from "node-html-markdown/dist/visitor.js";

const MIN_TABLE_SEPARATOR_COUNT = 3;
const MAX_TABLE_SEPARATOR_COUNT = 40;

export function getTableCustomTranslator(maxSeparatorCount?: number): TranslatorConfigObject {
  maxSeparatorCount = maxSeparatorCount ?? MAX_TABLE_SEPARATOR_COUNT;
  // max separator count can't be smaller than min
  maxSeparatorCount = Math.max(MIN_TABLE_SEPARATOR_COUNT, maxSeparatorCount);

  return {
    table: ({ visitor }: { visitor: Visitor }) => ({
      surroundingNewlines: 2,
      childTranslators: visitor.instance.tableTranslators,
      postprocess: ({ content, nodeMetadata, node }) => {
        // Split into lines and filter out empty lines
        const lines = content.split("\n").filter((line) => line.trim());
        if (lines.length < 1) {
          return "RemoveNode";
        }

        // Process each line to extract column data and track max content length per column
        const rows: string[][] = [];
        let maxCols = 0;
        const colMaxLen = new Map<number, number>();

        for (const line of lines) {
          // Remove leading/trailing pipes and split by pipe
          const cleanLine = line.replace(/^\|\s*/, "").replace(/\s*\|$/, "");
          const cols = cleanLine.split("|").map((col) => col.trim());
          rows.push(cols);
          maxCols = Math.max(maxCols, cols.length);
          for (let i = 0; i < cols.length; i++) {
            colMaxLen.set(i, Math.max(colMaxLen.get(i) ?? MIN_TABLE_SEPARATOR_COUNT, cols[i].length));
          }
        }

        // Rebuild table with minimal separators
        let res = "";
        const caption = nodeMetadata.get(node)?.tableMeta?.caption;
        if (caption) {
          res += caption + "\n";
        }

        rows.forEach((cols: string[], rowNumber: number) => {
          res += "| ";
          for (let i = 0; i < maxCols; i++) {
            const cellContent = cols[i] || "";
            const padLen = Math.min(colMaxLen.get(i) ?? MIN_TABLE_SEPARATOR_COUNT, maxSeparatorCount);
            res += cellContent + " ".repeat(Math.max(0, padLen - cellContent.length)) + " |";
            if (i < maxCols - 1) {
              res += " ";
            }
          }

          res += "\n";

          // Add separator row after header with dash count based on column content width
          if (rowNumber === 0) {
            res += "|";
            for (let i = 0; i < maxCols; i++) {
              const dashes = Math.max(
                MIN_TABLE_SEPARATOR_COUNT,
                Math.min(colMaxLen.get(i) ?? MIN_TABLE_SEPARATOR_COUNT, maxSeparatorCount)
              );
              res += " " + "-".repeat(dashes) + " |";
            }

            res += "\n";
          }
        });

        return res;
      },
    }),
  };
}
