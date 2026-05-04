import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./services/query-client.js";
import { WsProvider } from "./providers/ws-provider.js";
import { HeaderProvider } from "./providers/header-provider.js";
import { ErrorBoundary } from "./components/common/error-boundary.js";
import { AppLayout } from "./components/layout/app-layout.js";
import { AppContent } from "./components/layout/app-content.js";
import { ModalDialogProvider } from "./providers/modal-dialog-provider.js";
import { FullPanelProvider } from "./providers/full-panel-provider.js";
import { ContextMenuProvider } from "./providers/context-menu-provider.js";
import { AgentsProvider } from "./providers/agents-provider.js";
import { TasksProvider } from "./providers/tasks-provider.js";
import { AccessKeyPage } from "./components/auth/access-key-page.js";
import { requestGeolocation } from "./services/geolocation.js";
import { useAppStore } from "./stores/app-store.js";

/**
 * App root - thin shell with providers and top-level composition.
 * Renders auth gate when no access key is stored, otherwise the full app.
 */
export function App() {
  const accessKey = useAppStore((state) => state.accessKey);

  // Request geolocation once on mount — best-effort, silent on denial
  useEffect(() => {
    requestGeolocation();
  }, []);
  if (!accessKey) {
    return (
      <ErrorBoundary>
        <AccessKeyPage />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WsProvider>
          <AgentsProvider>
            <TasksProvider>
              <ContextMenuProvider>
                <ModalDialogProvider>
                  <FullPanelProvider>
                    <HeaderProvider>
                      <AppLayout>
                        <AppContent />
                      </AppLayout>
                    </HeaderProvider>
                  </FullPanelProvider>
                </ModalDialogProvider>
              </ContextMenuProvider>
            </TasksProvider>
          </AgentsProvider>
        </WsProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
