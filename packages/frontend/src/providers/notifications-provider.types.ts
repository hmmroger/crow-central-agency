import type { ViewMode } from "../stores/app-store.js";

export type NavNotificationKind = (typeof NAV_NOTIFICATION_KIND)[keyof typeof NAV_NOTIFICATION_KIND];
export const NAV_NOTIFICATION_KIND = {
  COUNT: "count",
  DOT: "dot",
} as const;

export interface NavCountNotification {
  kind: (typeof NAV_NOTIFICATION_KIND)["COUNT"];
  count: number;
  /** Accessible description, e.g. "3 open tasks" */
  description: string;
}

export interface NavDotNotification {
  kind: (typeof NAV_NOTIFICATION_KIND)["DOT"];
  /** Accessible description of what needs attention */
  description: string;
}

export type NavNotification = NavCountNotification | NavDotNotification;

/** Value exposed by the NotificationsProvider context */
export interface NotificationsContextValue {
  /** Notification per view mode; modes without a notification (or with a zero count) are absent */
  notifications: Partial<Record<ViewMode, NavNotification>>;
}
