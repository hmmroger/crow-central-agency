import type { Token, Tokens } from "marked";
import {
  HTMLVIEW_FENCE_LANG,
  isHashtagToken,
  isWikilinkToken,
  TAG_TOKEN,
  WIKILINK_TOKEN,
} from "@crow-central-agency/shared";
import { ENDING_NEWLINE_PATTERN } from "../../../utils/marked-config.js";
import type { LexedMarkdown, TextMark, TokenMarks } from "../../../utils/marked-config.types.js";
import type { FindRange } from "./find.types.js";
import type { MarkdownFindPiece, MarkdownFindText } from "./markdown-find.types.js";

const BOUNDARY = "\n";
const CELL_SEPARATOR = "\t";
const TAG_SEPARATOR = " ";
const TAG_MARK = "#";
const EXCLUDED_CODE_LANGUAGES = new Set(["mermaid", HTMLVIEW_FENCE_LANG]);

/** Collects the text a rendered document shows, one newline per block boundary and `<br>` */
class MarkdownFindTextBuilder {
  private text = "";
  private readonly pieces: MarkdownFindPiece[] = [];
  private hasPendingBoundary = false;

  public build(tokens: Token[]): MarkdownFindText {
    this.addBlocks(tokens);

    return { text: this.text, pieces: this.pieces };
  }

  private addBlocks(tokens: Token[]): void {
    for (const token of tokens) {
      this.addBlock(token);
    }
  }

  private addBlock(token: Token): void {
    switch (token.type) {
      case "paragraph":
      case "heading":
      case "text":
        this.startBlock();
        this.addInline(token.tokens ?? [token]);
        return;

      case "code":
        if (!EXCLUDED_CODE_LANGUAGES.has(token.lang ?? "")) {
          this.startBlock();
          this.addPiece(token, token.text.replace(ENDING_NEWLINE_PATTERN, ""));
        }

        return;

      case "blockquote":
        this.addBlocks(token.tokens ?? []);
        return;

      case "list":
        for (const item of token.items) {
          this.startBlock();
          this.addBlocks(item.tokens);
        }

        return;

      case "table":
        this.addTableRow(token.header);
        for (const row of token.rows) {
          this.addTableRow(row);
        }

        return;

      case TAG_TOKEN.TAGLINE:
        this.startBlock();
        (token.tokens ?? []).forEach((tag, index) => {
          if (index > 0) {
            this.addSeparator(TAG_SEPARATOR);
          }

          this.addInline([tag]);
        });
    }
  }

  private addTableRow(cells: Tokens.TableCell[]): void {
    this.startBlock();
    cells.forEach((cell, index) => {
      if (index > 0) {
        this.addSeparator(CELL_SEPARATOR);
      }

      this.addInline(cell.tokens);
    });
  }

  private addInline(tokens: Token[]): void {
    for (const token of tokens) {
      switch (token.type) {
        case "text":
          if (token.tokens) {
            this.addInline(token.tokens);
          } else if (!token.escaped) {
            this.addPiece(token, token.text);
          }

          break;

        case "escape":
        case "codespan":
          this.addPiece(token, token.text);
          break;

        case "strong":
        case "em":
        case "del":
        case "link":
          this.addInline(token.tokens ?? []);
          break;

        case "br":
          this.addSeparator(BOUNDARY);
          break;

        case WIKILINK_TOKEN:
          if (isWikilinkToken(token) && !token.isEmbed) {
            this.addPiece(token, token.target);
          }

          break;

        case TAG_TOKEN.HASHTAG:
          if (isHashtagToken(token)) {
            this.addPiece(token, `${TAG_MARK}${token.text}`);
          }
      }
    }
  }

  private startBlock(): void {
    this.hasPendingBoundary = this.text.length > 0;
  }

  private flushBoundary(): void {
    if (this.hasPendingBoundary) {
      this.text += BOUNDARY;
      this.hasPendingBoundary = false;
    }
  }

  private addSeparator(separator: string): void {
    this.flushBoundary();
    this.text += separator;
  }

  private addPiece(token: Tokens.Generic, shownText: string): void {
    if (!shownText) {
      return;
    }

    this.flushBoundary();
    const start = this.text.length;
    this.text += shownText;
    this.pieces.push({ token, start, end: this.text.length });
  }
}

export function buildMarkdownFindText(markdownDocument: LexedMarkdown): MarkdownFindText {
  return new MarkdownFindTextBuilder().build(markdownDocument.tokens);
}

/** Splits each match over the tokens whose text it covers, so a match across tokens becomes several marks */
export function toTokenMarks(findText: MarkdownFindText, matches: FindRange[], currentIndex?: number): TokenMarks {
  const marks = new Map<Tokens.Generic, TextMark[]>();
  const { pieces } = findText;
  let firstPieceIndex = 0;

  matches.forEach((match, matchIndex) => {
    while (firstPieceIndex < pieces.length && pieces[firstPieceIndex].end <= match.start) {
      firstPieceIndex++;
    }

    for (let pieceIndex = firstPieceIndex; pieceIndex < pieces.length; pieceIndex++) {
      const piece = pieces[pieceIndex];
      if (piece.start >= match.end) {
        break;
      }

      const mark: TextMark = {
        start: Math.max(match.start, piece.start) - piece.start,
        end: Math.min(match.end, piece.end) - piece.start,
        isCurrent: matchIndex === currentIndex,
      };
      const tokenMarks = marks.get(piece.token);
      if (tokenMarks) {
        tokenMarks.push(mark);
      } else {
        marks.set(piece.token, [mark]);
      }
    }
  });

  return marks;
}
