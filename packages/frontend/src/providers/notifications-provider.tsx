import { createContext, useContext, useMemo, type ReactNode } from "react";
import { VIEW_MODE } from "../stores/app-store.js";
import { useAgentsNotification } from "../hooks/notifications/use-agents-notification.js";
import { useTasksNotification } from "../hooks/notifications/use-tasks-notification.js";
import {
  NAV_NOTIFICATION_KIND,
  type NavNotification,
  type NotificationsContextValue,
} from "./notifications-provider.types.js";

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

function isVisibleNotification(notification: NavNotification | undefined): notification is NavNotification {
  return notification !== undefined && (notification.kind !== NAV_NOTIFICATION_KIND.COUNT || notification.count > 0);
}

/**
 * Answers "what is the notification for this view mode?" for nav consumers.
 * Composes one source hook per mode; values are derived live from the data providers, never copied.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const agentsNotification = useAgentsNotification();
  const tasksNotification = useTasksNotification();

  const value = useMemo<NotificationsContextValue>(() => {
    const notifications: NotificationsContextValue["notifications"] = {};
    if (isVisibleNotification(agentsNotification)) {
      notifications[VIEW_MODE.AGENTS] = agentsNotification;
    }

    if (isVisibleNotification(tasksNotification)) {
      notifications[VIEW_MODE.TASKS] = tasksNotification;
    }

    return { notifications };
  }, [agentsNotification, tasksNotification]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

/**
 * Access nav notifications keyed by view mode.
 * Must be used within a NotificationsProvider.
 */
export function useNotificationsContext(): NotificationsContextValue {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error("useNotificationsContext must be used within a NotificationsProvider");
  }

  return context;
}
