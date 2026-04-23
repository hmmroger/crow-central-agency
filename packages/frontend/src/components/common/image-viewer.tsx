import { useCallback, useRef, useState } from "react";
import { Download, RotateCw, ZoomIn, ZoomOut } from "lucide-react";

interface ImageViewerProps {
  src: string;
  alt: string;
  filename?: string;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

/**
 * Image viewer with zoom, pan, rotate, and download controls.
 * Scroll to zoom, drag to pan, toolbar for actions.
 */
export function ImageViewer({ src, alt, filename }: ImageViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const handleRotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  const handleDownload = useCallback(() => {
    const link = document.createElement("a");
    link.href = src;
    link.download = filename ?? alt;
    link.click();
  }, [src, filename, alt]);

  const handleWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((prev) => Math.min(Math.max(prev + delta, MIN_ZOOM), MAX_ZOOM));
  }, []);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (event.button !== 0) {
      return;
    }

    dragging.current = true;
    lastPos.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!dragging.current) {
      return;
    }

    const dx = event.clientX - lastPos.current.x;
    const dy = event.clientY - lastPos.current.y;
    lastPos.current = { x: event.clientX, y: event.clientY };
    setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border-subtle">
        <div className="flex items-center gap-1">
          <ToolbarButton icon={ZoomOut} title="Zoom out" onClick={handleZoomOut} disabled={zoom <= MIN_ZOOM} />
          <button
            type="button"
            className="px-1.5 py-0.5 text-2xs font-mono text-text-muted hover:text-text-base transition-colors min-w-12 text-center"
            onClick={handleReset}
            title="Reset view"
          >
            {zoomPercent}%
          </button>
          <ToolbarButton icon={ZoomIn} title="Zoom in" onClick={handleZoomIn} disabled={zoom >= MAX_ZOOM} />
          <div className="h-3 border-l border-border-subtle mx-0.5" />
          <ToolbarButton icon={RotateCw} title="Rotate 90°" onClick={handleRotate} />
        </div>
        <ToolbarButton icon={Download} title="Download" onClick={handleDownload} />
      </div>

      {/* Canvas */}
      <div
        className="flex-1 overflow-hidden bg-surface-inset cursor-grab active:cursor-grabbing select-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="flex items-center justify-center h-full w-full">
          <img
            src={src}
            alt={alt}
            className="pointer-events-none"
            draggable={false}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: "center",
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
            }}
          />
        </div>
      </div>
    </div>
  );
}

interface ToolbarButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}

function ToolbarButton({ icon: Icon, title, onClick, disabled }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className="p-1 rounded text-text-muted hover:text-text-base hover:bg-surface-elevated transition-colors disabled:opacity-30 disabled:pointer-events-none"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
