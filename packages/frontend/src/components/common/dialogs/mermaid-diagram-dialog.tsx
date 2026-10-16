import { useEffect, useRef } from "react";
import { ActionButton } from "../action-button.js";
import { createMermaidViewport } from "../markdown/mermaid-viewport.js";
import { useMermaidViewport } from "../markdown/use-mermaid-viewport.js";

interface MermaidDiagramDialogProps {
  /** Copy of the already-rendered, sanitized diagram SVG. */
  svg: Node;
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

/**
 * Expanded view of a rendered mermaid diagram, with the same zoom and pan
 * viewport as the inline diagram, starting unzoomed.
 */
export function MermaidDiagramDialog({ svg, onClose }: MermaidDiagramDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useMermaidViewport(containerRef);

  useEffect(() => {
    containerRef.current?.replaceChildren(createMermaidViewport(svg, false));
  }, [svg]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div
        ref={containerRef}
        className="mermaid-expanded flex-1 min-h-0 m-3 rounded-md border border-border bg-surface p-2"
      />

      <div className="flex items-center justify-end px-3 py-2 bg-surface-elevated">
        <ActionButton label="Close" onClick={onClose} />
      </div>
    </div>
  );
}
