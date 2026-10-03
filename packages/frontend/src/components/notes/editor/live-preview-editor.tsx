import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createEditorSubscription } from "./editor-subscription.js";
import { createBaseSetup } from "./extensions/base-setup.js";
import { clickHandler } from "./extensions/click-handler.js";
import { currentNote } from "./extensions/current-note-state.js";
import { editorError } from "./extensions/editor-error-state.js";
import { imagePaste } from "./extensions/image-paste.js";
import { imagePreview } from "./extensions/image-preview.js";
import { markdownPreview } from "./extensions/markdown-preview.js";
import { fencePreview } from "./extensions/fence-preview.js";
import { notesTree } from "./extensions/notes-tree-state.js";
import { pasteHandler } from "./extensions/paste-handler.js";
import { tableEditor } from "./extensions/table-editor.js";
import { wikilinkAutocomplete } from "./extensions/wikilink-autocomplete.js";
import { wikilinkOpen } from "./extensions/wikilink-open.js";
import type { LivePreviewEditorProps } from "./live-preview-editor.types.js";

// The EditContext input path misbehaves in the app; CodeMirror's typings do not declare the switch.
Reflect.set(EditorView, "EDIT_CONTEXT", false);

/**
 * CodeMirror editor whose document is the markdown itself, so `onChange`
 * emits text without any conversion. Seeded once; remount (via `key`) to reseed.
 */
export function LivePreviewEditor({
  noteId,
  markdown,
  onChange,
  onBlur,
  ariaLabel,
  onEditorReady,
  className,
}: LivePreviewEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | undefined>(undefined);
  const [initialMarkdown] = useState(markdown);
  const [initialNoteId] = useState(noteId);
  const [labelCompartment] = useState(() => new Compartment());
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const onEditorReadyRef = useRef(onEditorReady);

  useEffect(() => {
    onChangeRef.current = onChange;
    onBlurRef.current = onBlur;
    onEditorReadyRef.current = onEditorReady;
  }, [onChange, onBlur, onEditorReady]);

  // Build the view before paint, so the canvas and the host's toolbar appear in the first frame.
  useLayoutEffect(() => {
    const parent = containerRef.current;

    if (!parent) {
      return;
    }

    const subscription = createEditorSubscription();
    const hostListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }

      if (update.focusChanged && !update.view.hasFocus) {
        onBlurRef.current();
      }
    });

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: initialMarkdown,
        extensions: [
          createBaseSetup(),
          markdownPreview(),
          fencePreview(),
          currentNote(initialNoteId),
          editorError(),
          notesTree(),
          imagePreview(),
          tableEditor(),
          wikilinkOpen(),
          clickHandler(),
          wikilinkAutocomplete(),
          imagePaste(),
          pasteHandler(),
          labelCompartment.of([]),
          subscription.extension,
          hostListener,
        ],
      }),
    });

    viewRef.current = view;
    view.focus();
    onEditorReadyRef.current({ view, subscribe: subscription.subscribe });

    return () => {
      onEditorReadyRef.current(undefined);
      viewRef.current = undefined;
      view.destroy();
    };
  }, [initialMarkdown, initialNoteId, labelCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: labelCompartment.reconfigure(EditorView.contentAttributes.of({ "aria-label": ariaLabel })),
    });
  }, [ariaLabel, labelCompartment]);

  return <div ref={containerRef} className={className} />;
}
