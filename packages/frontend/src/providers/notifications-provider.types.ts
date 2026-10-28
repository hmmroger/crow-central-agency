import type { ViewMode } from "../stores/app-store.js";

/** Notification for one view mode; `hasNotification` is false when there is nothing to show */
export interface ViewNotification {
  hasNotification: boolean;
  count?: number;
  /** Accessible description, e.g. "3 open tasks" */
  description?: string;
}

/** Value exposed by the NotificationsProvider context */
export interface NotificationsContextValue {
  getNotification: (mode: ViewMode) => ViewNotification;
}
