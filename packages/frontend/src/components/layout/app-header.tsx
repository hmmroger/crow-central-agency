import { CrowIcon } from "../common/icons/crow.js";
import { useHeader } from "../../hooks/use-header.js";
import { ConnectionStatus } from "./connection-status.js";

/**
 * Top bar - logo (branding only) + title (set by views via HeaderPortal).
 * Navigation is handled by the sidebar, actions live in per-view ActionBars.
 */
export function AppHeader() {
  const { title } = useHeader();

  return (
    <header className="flex items-center h-12 px-4 border-b border-border-subtle/20 bg-surface/80 backdrop-blur-sm shrink-0">
      <div className="flex items-center shrink-0 font-mono gap-2">
        <CrowIcon className="h-5 w-5 text-primary" size={20} />
        <div className="flex flex-col text-sm font-semibold tracking-tight text-text-base">
          <span className="leading-none">cr</span>
          <span className="leading-none">ow</span>
        </div>
      </div>

      <div className="h-5 w-px bg-border-subtle mx-5 shrink-0" />

      {/* Title - set by views via HeaderPortal */}
      <div className="flex-1 min-w-0">
        {title && <span className="text-sm font-medium text-text-base truncate">{title}</span>}
      </div>

      <ConnectionStatus />
    </header>
  );
}
