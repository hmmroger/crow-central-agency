import type { ReactNode } from "react";
import { AppHeader } from "./app-header.js";
import { AppSidebar } from "./app-sidebar.js";
import { ReconnectBanner } from "../common/reconnect-banner.js";
import { useWs } from "../../hooks/use-ws.js";

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * App layout shell — header spans full width, then sidebar + content side by side.
 */
export function AppLayout({ children }: AppLayoutProps) {
  const { connectionState } = useWs();

  return (
    <div className="flex flex-col h-screen bg-base text-text-primary">
      <AppHeader />
      <ReconnectBanner connectionState={connectionState} />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        {children}
      </div>
    </div>
  );
}
