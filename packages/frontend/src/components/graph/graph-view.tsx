import { HeaderPortal } from "../layout/header-portal.js";
import { GraphCanvas } from "./graph-canvas.js";

/**
 * Full-screen graph view — accessible from the sidebar.
 * Wraps GraphCanvas with zoom controls and legend overlays.
 */
export function GraphView() {
  return (
    <div className="flex flex-col h-full">
      <HeaderPortal title="Circles Map" />
      <GraphCanvas className="relative flex-1" showControls showLegend />
    </div>
  );
}
