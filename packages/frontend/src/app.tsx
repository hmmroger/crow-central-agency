import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./services/query-client.js";
import { WsProvider } from "./providers/ws-provider.js";
import { HeaderProvider } from "./providers/header-provider.js";
import { ErrorBoundary } from "./components/common/error-boundary.js";
import { AppLayout } from "./components/layout/app-layout.js";
import { AppContent } from "./components/layout/app-content.js";
import { ModalDialogProvider } from "./providers/modal-dialog-provider.js";
import { ContextMenuProvider } from "./providers/context-menu-provider.js";

/**
 * App root - thin shell with providers and top-level composition.
 */
export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WsProvider>
          <ContextMenuProvider>
            <ModalDialogProvider>
              <HeaderProvider>
                <AppLayout>
                  <AppContent />
                </AppLayout>
              </HeaderProvider>
            </ModalDialogProvider>
          </ContextMenuProvider>
        </WsProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
