import { Bird } from "lucide-react";
import { useHeader } from "../../hooks/use-header.js";
import type { HeaderAction } from "../../providers/header-provider.js";

/**
 * Top bar with two zones:
 * - Logo: Bird icon + "crow" (branding, no navigation)
 * - Title: set by views via HeaderPortal
 *
 * Navigation has been removed (logo is branding only, no back button).
 * Actions are still rendered here temporarily and will be moved to per-view
 * ActionBars in Phase 2.
 */
export function AppHeader() {
  const { title, actions } = useHeader();

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

      {/* Actions — temporarily kept until Phase 2 removes them */}
      {actions.length > 0 && (
        <div className="flex items-center gap-1 shrink-0">
          {actions.map((action) => (
            <HeaderActionButton key={action.key} action={action} />
          ))}
        </div>
      )}
    </header>
  );
}

/** Renders a single action button with treatment based on isPrimary / isDestructive */
function HeaderActionButton({ action }: { action: HeaderAction }) {
  const Icon = action.icon;

  let className =
    "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40";

  if (action.isDestructive) {
    className += " text-error hover:bg-error/10";
  } else if (action.isPrimary) {
    className += " bg-primary text-text-primary hover:opacity-90";
  } else {
    className += " text-text-muted hover:text-text-primary hover:bg-surface-elevated";
  }

  return (
    <button
      type="button"
      className={className}
      onClick={action.onClick}
      disabled={action.disabled}
      title={action.label}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {action.label}
    </button>
  );
}
