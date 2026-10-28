import type { ViewMode } from "../stores/app-store.js";

/** Value a data owner sets for a view mode */
export interface ViewNotification {
  count?: number;
  /** Accessible description, e.g. "3 open tasks" */
  description?: string;
}

/** Lookup result for one view mode; `hasNotification` is false when nothing is set */
export interface ViewNotificationLookup extends ViewNotification {
  hasNotification: boolean;
}

/** Set or clear (undefined) a view mode's notification */
export type SetViewNotification = (mode: ViewMode, notification: ViewNotification | undefined) => void;

/** Read the notification for one view mode */
export type GetViewNotification = (mode: ViewMode) => ViewNotificationLookup;
