import { AppLayout } from "./components/layout/app-layout.js";
import { AppContent } from "./components/layout/app-content.js";

/**
 * App root — thin shell with top-level composition.
 * No logic here. WsProvider added in task 1.6.
 */
export function App() {
  return (
    <AppLayout>
      <AppContent />
    </AppLayout>
  );
}
