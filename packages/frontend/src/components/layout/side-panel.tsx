import { PanelRight, X } from "lucide-react";
import { useAppStore, VIEW_MODE, SIDE_PANEL_MIN_WIDTH, SIDE_PANEL_MAX_WIDTH } from "../../stores/app-store.js";
import { useResizablePanel } from "../../hooks/use-resizable-panel.js";
import { PanelResizeHandle } from "./panel-resize-handle.js";
import { AgentsViewSidePanel } from "../agents/agents-view-side-panel.js";

/**
 * Right side panel — renders view-specific content with a resize handle.
 * When closed, shows a floating toggle button on the center-right edge.
 * Only renders for views that have side panel content (Agents view for now).
 */
export function SidePanel() {
  const viewMode = useAppStore((state) => state.viewMode);
  const sidePanelOpen = useAppStore((state) => state.sidePanelOpen);
  const sidePanelWidth = useAppStore((state) => state.sidePanelWidth);
  const toggleSidePanel = useAppStore((state) => state.toggleSidePanel);
  const setSidePanelWidth = useAppStore((state) => state.setSidePanelWidth);

  const resizeHandle = useResizablePanel({
    minWidth: SIDE_PANEL_MIN_WIDTH,
    maxWidth: SIDE_PANEL_MAX_WIDTH,
    currentWidth: sidePanelWidth,
    onResize: setSidePanelWidth,
    direction: "right",
  });

  // Determine content based on view mode — only agents view has content for now
  const hasContent = viewMode === VIEW_MODE.AGENTS;

  if (!hasContent) {
    return null;
  }

  return (
    <div className="relative shrink-0" style={{ width: sidePanelOpen ? sidePanelWidth : 0 }}>
      {/* Floating toggle when panel is closed */}
      {!sidePanelOpen && (
        <button
          type="button"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-l-md bg-surface-elevated border border-r-0 border-primary/20 text-primary/70 hover:text-primary hover:bg-primary/10 hover:border-primary/40 transition-colors"
          onClick={toggleSidePanel}
          title="Open side panel"
        >
          <PanelRight className="h-4 w-4" />
        </button>
      )}

      {/* Open panel */}
      {sidePanelOpen && (
        <div className="flex h-full">
          <PanelResizeHandle
            onPointerDown={resizeHandle.handlePointerDown}
            onKeyDown={resizeHandle.handleKeyDown}
            className="absolute top-0 bottom-0 left-0 z-10"
          />

          <div className="flex flex-col flex-1 min-w-0 border-l border-border-subtle/30 bg-surface/50">
            {/* Panel header with close button */}
            <div className="flex items-center justify-end px-3 py-2 shrink-0">
              <button
                type="button"
                className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
                onClick={toggleSidePanel}
                title="Close side panel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* View-specific content */}
            <div className="flex-1 overflow-y-auto">{viewMode === VIEW_MODE.AGENTS && <AgentsViewSidePanel />}</div>
          </div>
        </div>
      )}
    </div>
  );
}
