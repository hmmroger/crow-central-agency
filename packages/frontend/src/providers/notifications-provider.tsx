import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { ViewMode } from "../stores/app-store.js";
import type {
  GetViewNotification,
  SetViewNotification,
  ViewNotification,
  ViewNotificationLookup,
} from "./notifications-provider.types.js";

const EMPTY_LOOKUP: ViewNotificationLookup = { hasNotification: false };

const SetNotificationContext = createContext<SetViewNotification | undefined>(undefined);
const GetNotificationContext = createContext<GetViewNotification | undefined>(undefined);

/**
 * Generic store of nav notifications keyed by view mode. Data owners push values; nav consumers look them up.
 * The setter and lookup live in separate contexts so setters don't re-render when notifications change.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Partial<Record<ViewMode, ViewNotification>>>({});

  const setNotification = useCallback<SetViewNotification>((mode, notification) => {
    setNotifications((prev) => {
      const current = prev[mode];
      if (
        (current === undefined) === (notification === undefined) &&
        current?.count === notification?.count &&
        current?.description === notification?.description
      ) {
        return prev;
      }

      const next = { ...prev };
      if (notification) {
        next[mode] = notification;
      } else {
        delete next[mode];
      }

      return next;
    });
  }, []);

  const getNotification = useCallback<GetViewNotification>(
    (mode) => {
      const notification = notifications[mode];

      return notification ? { hasNotification: true, ...notification } : EMPTY_LOOKUP;
    },
    [notifications]
  );

  return (
    <SetNotificationContext.Provider value={setNotification}>
      <GetNotificationContext.Provider value={getNotification}>{children}</GetNotificationContext.Provider>
    </SetNotificationContext.Provider>
  );
}

/**
 * Setter for a view mode's notification. Stable across renders.
 * Must be used within a NotificationsProvider.
 */
export function useSetNotification(): SetViewNotification {
  const context = useContext(SetNotificationContext);

  if (!context) {
    throw new Error("useSetNotification must be used within a NotificationsProvider");
  }

  return context;
}

/**
 * Lookup for one view mode's notification. Changes identity when notifications change.
 * Must be used within a NotificationsProvider.
 */
export function useGetNotification(): GetViewNotification {
  const context = useContext(GetNotificationContext);

  if (!context) {
    throw new Error("useGetNotification must be used within a NotificationsProvider");
  }

  return context;
}
