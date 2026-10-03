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
import type { EditorState } from "@codemirror/state";
import {
  getHeadingLevel,
  getListKind,
  insertDivider,
  isBlockquoteActive,
  isCodeBlockActive,
  isInlineFormatActive,
  setParagraph,
  toggleBlockquote,
  toggleCodeBlock,
  toggleHeading,
  toggleInlineFormat,
  toggleList,
} from "./editor/markdown-commands.js";
import { INLINE_FORMAT, LIST_KIND, type InlineFormat, type ListKind } from "./editor/markdown-commands.types.js";
import { ACTION_BUTTON_VARIANT } from "../common/action-button.js";
import { isTableCellActive } from "./editor/extensions/table-cell-state.js";
import {
  addTableColumn,
  addTableRow,
  canDeleteTableRow,
  deleteTable,
  deleteTableColumn,
  deleteTableRow,
  insertTable,
} from "./editor/table-commands.js";
import type { EditorCommand } from "./editor-toolbar.types.js";
import { TableDeleteColumnIcon } from "./table-delete-column-icon.js";
import { TableDeleteRowIcon } from "./table-delete-row-icon.js";

/** Formatting edits the note's text, so it is off while a table cell is being edited. */
export function isOutsideTableCell(state: EditorState): boolean {
  return !isTableCellActive(state);
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
  isActive: (state) => getHeadingLevel(state) === level,
  canRun: isOutsideTableCell,
  run: (target) => toggleHeading(target, level),
}));

function createInlineFormatCommand(
  label: string,
  icon: ComponentType<{ className?: string }>,
  format: InlineFormat
): EditorCommand {
  return {
    label,
    icon,
    isActive: (state) => isInlineFormatActive(state, format),
    canRun: isOutsideTableCell,
    run: (target) => toggleInlineFormat(target, format),
  };
}

const PARAGRAPH_COMMAND: EditorCommand = {
  label: "Paragraph",
  icon: Pilcrow,
  isActive: (state) => getHeadingLevel(state) === undefined,
  canRun: isOutsideTableCell,
  run: setParagraph,
};

export const BLOCK_TYPE_COMMANDS: EditorCommand[] = [PARAGRAPH_COMMAND].concat(HEADING_COMMANDS);

function createListCommand(label: string, icon: ComponentType<{ className?: string }>, kind: ListKind): EditorCommand {
  return {
    label,
    icon,
    isActive: (state) => getListKind(state) === kind,
    canRun: isOutsideTableCell,
    run: (target) => toggleList(target, kind),
  };
}

export const LIST_COMMANDS: EditorCommand[] = [
  createListCommand("Bullet list", List, LIST_KIND.BULLET),
  createListCommand("Numbered list", ListOrdered, LIST_KIND.ORDERED),
  createListCommand("Task list", ListTodo, LIST_KIND.TASK),
];

export const BLOCK_COMMANDS: EditorCommand[] = [
  { label: "Quote", icon: Quote, isActive: isBlockquoteActive, canRun: isOutsideTableCell, run: toggleBlockquote },
  {
    label: "Code block",
    icon: SquareCode,
    isActive: isCodeBlockActive,
    canRun: isOutsideTableCell,
    run: toggleCodeBlock,
  },
  { label: "Divider", icon: Minus, isActive: isNeverActive, canRun: isOutsideTableCell, run: insertDivider },
  { label: "Table", icon: Table, isActive: isNeverActive, canRun: isOutsideTableCell, run: insertTable },
];

/** Shown only while a table cell is active; each acts on that cell's table. */
export const TABLE_COMMANDS: EditorCommand[] = [
  {
    label: "Add row",
    icon: BetweenHorizontalEnd,
    isActive: isNeverActive,
    canRun: isTableCellActive,
    run: addTableRow,
  },
  {
    label: "Add column",
    icon: BetweenVerticalEnd,
    isActive: isNeverActive,
    canRun: isTableCellActive,
    run: addTableColumn,
  },
  {
    label: "Delete row",
    icon: TableDeleteRowIcon,
    isActive: isNeverActive,
    canRun: canDeleteTableRow,
    run: deleteTableRow,
  },
  {
    label: "Delete column",
    icon: TableDeleteColumnIcon,
    isActive: isNeverActive,
    canRun: isTableCellActive,
    run: deleteTableColumn,
  },
  {
    label: "Delete table",
    icon: Grid2x2X,
    isActive: isNeverActive,
    canRun: isTableCellActive,
    run: deleteTable,
    variant: ACTION_BUTTON_VARIANT.DESTRUCTIVE,
  },
];

export const MARK_COMMANDS: EditorCommand[] = [
  createInlineFormatCommand("Bold", Bold, INLINE_FORMAT.BOLD),
  createInlineFormatCommand("Italic", Italic, INLINE_FORMAT.ITALIC),
  createInlineFormatCommand("Strikethrough", Strikethrough, INLINE_FORMAT.STRIKETHROUGH),
  createInlineFormatCommand("Inline code", Code, INLINE_FORMAT.INLINE_CODE),
];
