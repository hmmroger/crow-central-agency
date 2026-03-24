import { WsProvider } from "./providers/ws-provider.js";
import { HeaderProvider } from "./providers/header-provider.js";
import { ErrorBoundary } from "./components/common/error-boundary.js";
import { AppLayout } from "./components/layout/app-layout.js";
import { AppContent } from "./components/layout/app-content.js";

/**
 * App root — thin shell with providers and top-level composition.
 */
export function App() {
  return (
    <ErrorBoundary>
      <WsProvider>
        <HeaderProvider>
          <AppLayout>
            <AppContent />
          </AppLayout>
        </HeaderProvider>
      </WsProvider>
    </ErrorBoundary>
  );
}
