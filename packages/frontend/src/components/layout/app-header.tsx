/**
 * App header — title and global stats placeholder
 */
export function AppHeader() {
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-border-subtle bg-surface/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-text-primary">Crow Central Agency</h1>
        <span className="text-xs text-text-muted font-mono">v0.1.0</span>
      </div>

      {/* Global stats — populated in Phase 4 */}
      <div className="flex items-center gap-4 text-sm text-text-muted" />
    </header>
  );
}
