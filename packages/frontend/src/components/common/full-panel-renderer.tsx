import { motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../../utils/cn.js";
import type { FullPanelConfig } from "../../providers/full-panel-provider.types.js";

interface FullPanelRendererProps {
  config: FullPanelConfig;
  onClose: () => void;
}

/**
 * Renders the active full panel as a fixed surface filling the area below the
 * 12-unit app header. No backdrop, no focus trap — this is a content takeover,
 * not a modal. Hidden at the side-panel breakpoint (`lg`) where the regular
 * SidePanel is visible instead.
 */
export function FullPanelRenderer({ config, onClose }: FullPanelRendererProps) {
  const titleId = `full-panel-title-${config.id}`;

  return (
    <motion.div
      role="dialog"
      aria-modal="false"
      aria-labelledby={config.title ? titleId : undefined}
      className={cn(
        "fixed inset-x-0 top-[var(--header-height)] bottom-0 lg:hidden flex flex-col",
        "bg-surface border-t border-border-subtle/30"
      )}
      style={{ zIndex: "var(--z-modal-base)" }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 h-10 border-b border-border-subtle/30">
        {config.title ? (
          <h2 id={titleId} className="text-sm font-medium text-text-base truncate">
            {config.title}
          </h2>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 p-1 rounded text-text-muted hover:text-text-base hover:bg-surface-hover transition-colors"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{config.content}</div>
    </motion.div>
  );
}
