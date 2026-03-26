import { Bird } from "lucide-react";
import { useHeader } from "../../hooks/use-header.js";

/**
 * Top bar — logo (branding only) + title (set by views via HeaderPortal).
 * Navigation is handled by the sidebar, actions live in per-view ActionBars.
 */
export function AppHeader() {
  const { title } = useHeader();

  return (
    <header className="flex items-center h-12 px-4 border-b border-border-subtle bg-surface/80 backdrop-blur-sm shrink-0">
      {/* Logo — branding only */}
      <div className="flex items-center gap-2 shrink-0">
        <Bird className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold tracking-tight text-text-primary">crow</span>
      </div>

      <div className="h-5 w-px bg-border-subtle mx-3 shrink-0" />

      {/* Title — set by views via HeaderPortal */}
      <div className="flex-1 min-w-0">
        {title && <span className="text-sm font-medium text-text-primary truncate">{title}</span>}
      </div>
    </header>
  );
}
