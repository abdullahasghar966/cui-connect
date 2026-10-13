/**
 * Notification settings: for each kind of notification, whether it reaches you in the app and on
 * your phone, only in the app, or not at all. Announcements from IT can't be turned off.
 * Direct messages aren't notifications (they arrive in Chats), but whether they are pushed to
 * your phone while you're away is a setting too.
 */
import { NOTIFICATION_TYPES, type NotificationType } from './constants';

export const NOTIFICATION_LEVELS = ['all', 'app', 'off'] as const;
export type NotificationLevel = (typeof NOTIFICATION_LEVELS)[number];

export const NOTIFICATION_LEVEL_LABELS: Record<NotificationLevel, string> = {
  all: 'App and phone',
  app: 'Only in the app',
  off: 'Off',
};

/** Always delivered everywhere: urgent notices from IT. */
export const ALWAYS_ON_NOTIFICATIONS: readonly NotificationType[] = ['system'];

/** What is stored per person: only the exceptions (everything else is "app and phone"). */
export interface NotificationPrefs {
  off: NotificationType[];
  appOnly: NotificationType[];
  directMessagePush: boolean;
}

export function notificationLevel(
  prefs: Partial<NotificationPrefs> | null | undefined,
  type: NotificationType,
): NotificationLevel {
  if (ALWAYS_ON_NOTIFICATIONS.includes(type)) return 'all';
  if (prefs?.off?.includes(type)) return 'off';
  if (prefs?.appOnly?.includes(type)) return 'app';
  return 'all';
}

/** Every type with its level, for the settings page. */
export function notificationLevels(
  prefs: Partial<NotificationPrefs> | null | undefined,
): Record<NotificationType, NotificationLevel> {
  return Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [type, notificationLevel(prefs, type)]),
  ) as Record<NotificationType, NotificationLevel>;
}

/** The choices from the settings page, as stored (types left out stay "app and phone"). */
export function toNotificationPrefs(
  levels: Partial<Record<NotificationType, NotificationLevel>>,
  directMessagePush: boolean,
): NotificationPrefs {
  const pick = (level: NotificationLevel) =>
    NOTIFICATION_TYPES.filter(
      (type) => levels[type] === level && !ALWAYS_ON_NOTIFICATIONS.includes(type),
    );
  return { off: pick('off'), appOnly: pick('app'), directMessagePush };
}
