import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { EditorStateReporter } from "./editor-state-reporter.js";
import { createBaseSetup } from "./extensions/base-setup.js";
import { clickHandler } from "./extensions/click-handler.js";
import { currentNote } from "./extensions/current-note-state.js";
import { editorError } from "./extensions/editor-error-state.js";
import { markdownPreview } from "./extensions/markdown-preview.js";
import { pasteHandler } from "./extensions/paste-handler/paste-handler.js";
import { wikilinkAutocomplete } from "./extensions/wikilink-autocomplete.js";
import { wikilinkResolutions } from "./extensions/wikilink-resolution-state.js";
import { MarkdownEditorController } from "./markdown-editor-controller.js";
import type { MarkdownEditorProps } from "./markdown-editor.types.js";

// The EditContext input path misbehaves in the app; CodeMirror's typings do not declare the switch.
Reflect.set(EditorView, "EDIT_CONTEXT", false);

export function MarkdownEditor({
  noteId,
  markdown,
  onChange,
  onBlur,
  ariaLabel,
  onEditorReady,
  onFormatStateChange,
  onStatusChange,
  onWikilinkOpen,
  className,
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | undefined>(undefined);
  const [initialMarkdown] = useState(markdown);
  const [initialNoteId] = useState(noteId);
  const [labelCompartment] = useState(() => new Compartment());
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const onEditorReadyRef = useRef(onEditorReady);
  const onFormatStateChangeRef = useRef(onFormatStateChange);
  const onStatusChangeRef = useRef(onStatusChange);
  const onWikilinkOpenRef = useRef(onWikilinkOpen);

  useEffect(() => {
    onChangeRef.current = onChange;
    onBlurRef.current = onBlur;
    onEditorReadyRef.current = onEditorReady;
    onFormatStateChangeRef.current = onFormatStateChange;
    onStatusChangeRef.current = onStatusChange;
    onWikilinkOpenRef.current = onWikilinkOpen;
  }, [onChange, onBlur, onEditorReady, onFormatStateChange, onStatusChange, onWikilinkOpen]);

  // Build the view before paint, so the canvas and the host's toolbar appear in the first frame.
  useLayoutEffect(() => {
    const parent = containerRef.current;

    if (!parent) {
      return;
    }

    const reporter = new EditorStateReporter(
      (formatState) => onFormatStateChangeRef.current(formatState),
      (status) => onStatusChangeRef.current(status)
    );
    const hostListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }

      if (update.focusChanged && !update.view.hasFocus) {
        onBlurRef.current();
      }

      if (update.transactions.length > 0) {
        reporter.report(update.state);
      }
    });

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: initialMarkdown,
        extensions: [
          createBaseSetup(),
          markdownPreview(),
          currentNote(initialNoteId),
          editorError(),
          wikilinkResolutions(),
          wikilinkAutocomplete(),
          clickHandler((request) => onWikilinkOpenRef.current(request)),
          pasteHandler(),
          labelCompartment.of([]),
          hostListener,
        ],
      }),
    });

    viewRef.current = view;
    view.focus();
    reporter.report(view.state);
    onEditorReadyRef.current(new MarkdownEditorController(view));

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
