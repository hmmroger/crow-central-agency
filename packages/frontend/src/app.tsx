import { AppLayout } from "./components/layout/app-layout.js";
import { AppContent } from "./components/layout/app-content.js";

/**
 * App root — thin shell with context providers and top-level composition.
 * No logic here, just providers + layout + content.
 */
export function App() {
  return (
    <AppLayout>
      <AppContent />
    </AppLayout>
  );
}
