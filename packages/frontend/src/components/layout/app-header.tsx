import { ArrowLeft, Bird } from "lucide-react";
import { useAppStore } from "../../stores/app-store.js";
import { useHeaderSlots } from "../../hooks/use-header.js";
import type { HeaderAction } from "../../providers/header-provider.js";

/**
 * Top action bar with three zones:
 * - Logo: Bird icon + "crow" — click navigates to dashboard
 * - Nav: back button (auto, from view stack) + title (from views via useHeader)
 * - Actions: buttons rendered from structured descriptors (from views via useHeader)
 *
 * Back button is a framework concern — shown when viewStack has entries.
 * Views only provide title and actions via useHeader().
 */
export function AppHeader() {
  const goToDashboard = useAppStore((state) => state.goToDashboard);
  const goBack = useAppStore((state) => state.goBack);
  const hasHistory = useAppStore((state) => state.viewStack.length > 0);
  const { nav, actions } = useHeaderSlots();

  return (
    <header className="flex items-center h-12 px-4 border-b border-border-subtle bg-surface/80 backdrop-blur-sm shrink-0">
      {/* Logo — click to go home */}
      <button
        type="button"
        className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
        onClick={goToDashboard}
      >
        <Bird className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold tracking-tight text-text-primary">crow</span>
      </button>

      {/* Nav — back (framework) + title (view) */}
      <div className="flex-1 flex items-center gap-2 ml-4 min-w-0">
        {hasHistory && (
          <button
            type="button"
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors shrink-0"
            onClick={goBack}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        )}
        {nav?.title && <span className="text-sm font-medium text-text-primary truncate">{nav.title}</span>}
      </div>

      {/* Actions */}
      {actions && actions.length > 0 && (
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
