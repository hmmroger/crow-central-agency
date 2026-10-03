import {
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  Code,
  Grid2x2X,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Pilcrow,
  Quote,
  SquareCode,
  Strikethrough,
  Table,
} from "lucide-react";
import type { ComponentType } from "react";
import { INLINE_FORMAT, LIST_KIND, type InlineFormat, type ListKind } from "./editor/markdown-commands.types.js";
import type { EditorFormatState } from "./editor/markdown-editor.types.js";
import { ACTION_BUTTON_VARIANT } from "../common/action-button.js";
import type { EditorCommand } from "./editor-toolbar.types.js";
import { TableDeleteColumnIcon } from "../common/icons/table-delete-column.js";
import { TableDeleteRowIcon } from "../common/icons/table-delete-row.js";

/** Formatting edits the note's text, so it is off while a table cell is being edited. */
export function isOutsideTableCell(formatState: EditorFormatState): boolean {
  return !formatState.isInTableCell;
}

function isInTableCell(formatState: EditorFormatState): boolean {
  return formatState.isInTableCell;
}

function isNeverActive(): boolean {
  return false;
}

/** Heading levels the toolbar offers; deeper levels stay available by typing `#` prefixes. */
const HEADING_LEVELS = [1, 2, 3] as const;

const HEADING_ICONS: Record<(typeof HEADING_LEVELS)[number], ComponentType<{ className?: string }>> = {
  1: Heading1,
  2: Heading2,
  3: Heading3,
};

const HEADING_COMMANDS: EditorCommand[] = HEADING_LEVELS.map((level) => ({
  label: `Heading ${level}`,
  icon: HEADING_ICONS[level],
  isActive: (formatState) => formatState.headingLevel === level,
  canRun: isOutsideTableCell,
  run: (editor) => editor.toggleHeading(level),
}));

function createInlineFormatCommand(
  label: string,
  icon: ComponentType<{ className?: string }>,
  format: InlineFormat
): EditorCommand {
  return {
    label,
    icon,
    isActive: (formatState) => formatState.inlineFormats.includes(format),
    canRun: isOutsideTableCell,
    run: (editor) => editor.toggleInlineFormat(format),
  };
}

const PARAGRAPH_COMMAND: EditorCommand = {
  label: "Paragraph",
  icon: Pilcrow,
  isActive: (formatState) => formatState.headingLevel === undefined,
  canRun: isOutsideTableCell,
  run: (editor) => editor.setParagraph(),
};

export const BLOCK_TYPE_COMMANDS: EditorCommand[] = [PARAGRAPH_COMMAND].concat(HEADING_COMMANDS);

function createListCommand(label: string, icon: ComponentType<{ className?: string }>, kind: ListKind): EditorCommand {
  return {
    label,
    icon,
    isActive: (formatState) => formatState.listKind === kind,
    canRun: isOutsideTableCell,
    run: (editor) => editor.toggleList(kind),
  };
}

export const LIST_COMMANDS: EditorCommand[] = [
  createListCommand("Bullet list", List, LIST_KIND.BULLET),
  createListCommand("Numbered list", ListOrdered, LIST_KIND.ORDERED),
  createListCommand("Task list", ListTodo, LIST_KIND.TASK),
];

export const BLOCK_COMMANDS: EditorCommand[] = [
  {
    label: "Quote",
    icon: Quote,
    isActive: (formatState) => formatState.isBlockquote,
    canRun: isOutsideTableCell,
    run: (editor) => editor.toggleBlockquote(),
  },
  {
    label: "Code block",
    icon: SquareCode,
    isActive: (formatState) => formatState.isCodeBlock,
    canRun: isOutsideTableCell,
    run: (editor) => editor.toggleCodeBlock(),
  },
  {
    label: "Divider",
    icon: Minus,
    isActive: isNeverActive,
    canRun: isOutsideTableCell,
    run: (editor) => editor.insertDivider(),
  },
  {
    label: "Table",
    icon: Table,
    isActive: isNeverActive,
    canRun: isOutsideTableCell,
    run: (editor) => editor.insertTable(),
  },
];

/** Shown only while a table cell is active; each acts on that cell's table. */
export const TABLE_COMMANDS: EditorCommand[] = [
  {
    label: "Add row",
    icon: BetweenHorizontalEnd,
    isActive: isNeverActive,
    canRun: isInTableCell,
    run: (editor) => editor.addTableRow(),
  },
  {
    label: "Add column",
    icon: BetweenVerticalEnd,
    isActive: isNeverActive,
    canRun: isInTableCell,
    run: (editor) => editor.addTableColumn(),
  },
  {
    label: "Delete row",
    icon: TableDeleteRowIcon,
    isActive: isNeverActive,
    canRun: (formatState) => formatState.canDeleteTableRow,
    run: (editor) => editor.deleteTableRow(),
  },
  {
    label: "Delete column",
    icon: TableDeleteColumnIcon,
    isActive: isNeverActive,
    canRun: isInTableCell,
    run: (editor) => editor.deleteTableColumn(),
  },
  {
    label: "Delete table",
    icon: Grid2x2X,
    isActive: isNeverActive,
    canRun: isInTableCell,
    run: (editor) => editor.deleteTable(),
    variant: ACTION_BUTTON_VARIANT.DESTRUCTIVE,
  },
];

export const MARK_COMMANDS: EditorCommand[] = [
  createInlineFormatCommand("Bold", Bold, INLINE_FORMAT.BOLD),
  createInlineFormatCommand("Italic", Italic, INLINE_FORMAT.ITALIC),
  createInlineFormatCommand("Strikethrough", Strikethrough, INLINE_FORMAT.STRIKETHROUGH),
  createInlineFormatCommand("Inline code", Code, INLINE_FORMAT.INLINE_CODE),
];
