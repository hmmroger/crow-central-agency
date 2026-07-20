import { Maximize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback } from "react";
import type Sigma from "sigma";
import type { RefObject } from "react";
import type { GraphNodeAttributes, GraphEdgeAttributes } from "./graph-view.types.js";

interface GraphControlsProps {
  sigmaRef: RefObject<Sigma<GraphNodeAttributes, GraphEdgeAttributes> | null>;
  /** When provided, renders a control that clears saved positions and re-runs layout */
  onResetPositions?: () => void;
}

/**
 * Floating zoom and fit controls for the graph canvas.
 */
export function GraphControls({ sigmaRef, onResetPositions }: GraphControlsProps) {
  const handleZoomIn = useCallback(() => {
    sigmaRef.current?.getCamera().animatedZoom({ duration: 200 });
  }, [sigmaRef]);

  const handleZoomOut = useCallback(() => {
    sigmaRef.current?.getCamera().animatedUnzoom({ duration: 200 });
  }, [sigmaRef]);

  const handleFit = useCallback(() => {
    sigmaRef.current?.getCamera().animatedReset({ duration: 300 });
  }, [sigmaRef]);

  return (
    <div className="absolute bottom-4 right-4 flex flex-col gap-1 bg-surface-elevated/75 border border-border-subtle rounded-lg backdrop-blur-md p-1">
      <ControlButton icon={ZoomIn} label="Zoom in" onClick={handleZoomIn} />
      <ControlButton icon={ZoomOut} label="Zoom out" onClick={handleZoomOut} />
      <ControlButton icon={Maximize2} label="Fit to screen" onClick={handleFit} />
      {onResetPositions && <ControlButton icon={RotateCcw} label="Reset layout" onClick={onResetPositions} />}
    </div>
  );
}

interface ControlButtonProps {
  icon: typeof ZoomIn;
  label: string;
  onClick: () => void;
}

function ControlButton({ icon: Icon, label, onClick }: ControlButtonProps) {
  return (
    <button
      type="button"
      className="flex items-center justify-center w-8 h-8 rounded-md text-text-muted hover:text-text-base hover:bg-surface-elevated transition-colors"
      onClick={onClick}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
