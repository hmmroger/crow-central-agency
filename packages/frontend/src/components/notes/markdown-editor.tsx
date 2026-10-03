import { useState } from "react";
import { EditorStatusBar } from "./editor-status-bar.js";
import { EditorToolbar } from "./editor-toolbar.js";
import { LivePreviewEditor } from "./editor/live-preview-editor.js";
import type { LivePreviewEditorHandle } from "./editor/live-preview-editor.types.js";
import type { MarkdownEditorProps } from "./markdown-editor.types.js";

/**
 * Markdown editor with its toolbar and status bar. The canvas edits the
 * markdown source directly, so markdown is the only format that crosses this
 * component's boundary. Remount it (via `key`) to reseed.
 */
export function MarkdownEditor({ noteId, markdown, onChange, onBlur, alert, ariaLabel }: MarkdownEditorProps) {
  const [editor, setEditor] = useState<LivePreviewEditorHandle>();

  return (
    <div className="h-full flex flex-col gap-2 pt-2 px-2">
      <div className="note-canvas">{editor && <EditorToolbar editor={editor} />}</div>
      <LivePreviewEditor
        noteId={noteId}
        markdown={markdown}
        onChange={onChange}
        onBlur={onBlur}
        ariaLabel={ariaLabel}
        onEditorReady={setEditor}
        className="flex-1 min-h-0"
      />
      {editor && <EditorStatusBar editor={editor} alert={alert} />}
    </div>
  );
}
