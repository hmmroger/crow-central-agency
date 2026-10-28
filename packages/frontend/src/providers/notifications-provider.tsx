import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { VIEW_MODE, type ViewMode } from "../stores/app-store.js";
import { useActiveAgentCount } from "./agent-states-provider.js";
import { useTasksContext } from "./tasks-provider.js";
import type { NotificationsContextValue, ViewNotification } from "./notifications-provider.types.js";

const NO_NOTIFICATION: ViewNotification = { hasNotification: false };

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

/**
 * Derives nav notifications per view mode from the data owners' counts.
 * Owns each mode's rule: whether there is a notification, its count and its description.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const activeAgentCount = useActiveAgentCount();
  const { openTaskCount } = useTasksContext();

  const notifications = useMemo<Partial<Record<ViewMode, ViewNotification>>>(
    () => ({
      [VIEW_MODE.AGENTS]:
        activeAgentCount > 0
          ? {
              hasNotification: true,
              count: activeAgentCount,
              description: `${activeAgentCount} active ${activeAgentCount === 1 ? "agent" : "agents"}`,
            }
          : NO_NOTIFICATION,
      [VIEW_MODE.TASKS]:
        openTaskCount > 0
          ? {
              hasNotification: true,
              count: openTaskCount,
              description: `${openTaskCount} open ${openTaskCount === 1 ? "task" : "tasks"}`,
            }
          : NO_NOTIFICATION,
    }),
    [activeAgentCount, openTaskCount]
  );

  const getNotification = useCallback<NotificationsContextValue["getNotification"]>(
    (mode) => notifications[mode] ?? NO_NOTIFICATION,
    [notifications]
  );

  const value = useMemo<NotificationsContextValue>(() => ({ getNotification }), [getNotification]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

/**
 * Lookup for one view mode's notification.
 * Must be used within a NotificationsProvider.
 */
export function useGetNotification(): NotificationsContextValue["getNotification"] {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error("useGetNotification must be used within a NotificationsProvider");
  }

  return context.getNotification;
}
