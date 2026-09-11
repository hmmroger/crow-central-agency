import type { ReactNode } from "react";
import { useAgentPaletteHotkey } from "../../hooks/use-agent-palette-hotkey.js";
import { AppHeader } from "./app-header.js";
import { AppSidebar } from "./app-sidebar.js";
import { SidePanel } from "./side-panel.js";

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * App layout shell - header spans full width, then sidebar + content side by side.
 */
export function AppLayout({ children }: AppLayoutProps) {
  useAgentPaletteHotkey();

  return (
    <div className="flex flex-col h-screen bg-base text-text-base">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        {children}
        <SidePanel />
      </div>
    </div>
  );
}
