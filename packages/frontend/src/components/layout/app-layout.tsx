import type { ReactNode } from "react";
import { AppHeader } from "./app-header.js";

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * App layout shell — header + content area
 */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex flex-col h-screen bg-base text-text-primary">
      <AppHeader />
      {children}
    </div>
  );
}
