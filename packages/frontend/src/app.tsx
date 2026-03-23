import { WsProvider } from "./providers/ws-provider.js";
import { AppLayout } from "./components/layout/app-layout.js";
import { AppContent } from "./components/layout/app-content.js";

/**
 * App root — thin shell with providers and top-level composition.
 */
export function App() {
  return (
    <WsProvider>
      <AppLayout>
        <AppContent />
      </AppLayout>
    </WsProvider>
  );
}
