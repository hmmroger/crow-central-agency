import type { InlineFormat, ListKind } from "./markdown-commands.types.js";

/** What the host gets to drive a mounted editor; every edit returns focus to the editor */
export interface MarkdownEditorHandle {
  focus: () => void;
  setParagraph: () => void;
  toggleHeading: (level: number) => void;
  toggleInlineFormat: (format: InlineFormat) => void;
  toggleList: (kind: ListKind) => void;
  toggleBlockquote: () => void;
  toggleCodeBlock: () => void;
  insertDivider: () => void;
  /** Edits the link at the cursor, or links the selection; a blank `text` falls back to the selection or the URL */
  setLink: (text: string, url: string) => void;
  removeLink: () => void;
  insertTable: () => void;
  addTableRow: () => void;
  addTableColumn: () => void;
  deleteTableRow: () => void;
  deleteTableColumn: () => void;
  deleteTable: () => void;
}

/** A `[text](url)` link or `<url>` autolink at the cursor */
export interface EditorLink {
  /** Source between the brackets, inline formatting included; the URL for an autolink */
  text: string;
  /** Destination without a `<>` wrapper */
  url: string;
}

/** Formatting at the cursor, for the host's toolbar */
export interface EditorFormatState {
  /** `undefined` when the cursor's line is not a heading */
  headingLevel: number | undefined;
  listKind: ListKind | undefined;
  inlineFormats: InlineFormat[];
  isBlockquote: boolean;
  isCodeBlock: boolean;
  link: EditorLink | undefined;
  /** The main selection's text when it is non-empty and on one line */
  selectedText: string | undefined;
  isInTableCell: boolean;
  canDeleteTableRow: boolean;
}

export interface EditorStatus {
  /** 1-based source line of the main cursor */
  line: number;
  /** 1-based source column of the main cursor */
  column: number;
  /** Why the last image paste failed */
  error: string | undefined;
}

/** A wikilink the user asked to open */
export interface WikilinkOpenRequest {
  target: string;
  /** The note the target names, when the editor already knows it */
  noteId: string | undefined;
}

export interface MarkdownEditorProps {
  /** The note being edited, which pasted images are saved beside; read on mount */
  noteId: string;
  /** Markdown the editor is seeded with on mount; later changes are ignored */
  markdown: string;
  onChange: (markdown: string) => void;
  onBlur: () => void;
  ariaLabel: string;
  /** Receives the handle once the view exists, and `undefined` when it is destroyed */
  onEditorReady: (editor: MarkdownEditorHandle | undefined) => void;
  /** Called on mount and whenever the formatting at the cursor changes */
  onFormatStateChange: (formatState: EditorFormatState) => void;
  /** Called on mount and whenever the cursor position or editor error changes */
  onStatusChange: (status: EditorStatus) => void;
  /** Ctrl/Cmd + click on a wikilink that does not name a folder */
  onWikilinkOpen: (request: WikilinkOpenRequest) => void;
  className?: string;
}
