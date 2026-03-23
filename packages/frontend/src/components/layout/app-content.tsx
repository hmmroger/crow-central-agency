/**
 * App content — reads viewMode from app-store and renders the active view.
 * View-state-based navigation, no URL router.
 */
export function AppContent() {
  // Phase 1.6 will add app-store with viewMode and render dashboard/console/agent-editor
  return (
    <main className="flex-1 overflow-hidden">
      <div className="h-full flex items-center justify-center text-text-muted">Dashboard loading...</div>
    </main>
  );
}
