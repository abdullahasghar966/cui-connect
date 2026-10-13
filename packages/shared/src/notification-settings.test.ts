import { describe, expect, it } from 'vitest';
import { notificationSettingsSchema } from './academic-schemas';
import {
  notificationLevel,
  notificationLevels,
  toNotificationPrefs,
} from './notification-settings';

describe('notification settings', () => {
  it('stores only the exceptions, and IT announcements always stay on', () => {
    const prefs = toNotificationPrefs({ events: 'off', campus: 'app', results: 'all' }, false);
    expect(prefs).toEqual({ off: ['events'], appOnly: ['campus'], directMessagePush: false });
    expect(notificationLevel(prefs, 'events')).toBe('off');
    expect(notificationLevel(prefs, 'campus')).toBe('app');
    expect(notificationLevel(prefs, 'results')).toBe('all');
    // Even if someone stored it by hand.
    expect(notificationLevel({ off: ['system'] }, 'system')).toBe('all');
    expect(toNotificationPrefs({ system: 'off' }, true).off).toEqual([]);
    // No settings yet: everything everywhere.
    expect(Object.values(notificationLevels(null)).every((level) => level === 'all')).toBe(true);
  });

  it('refuses turning off announcements from IT', () => {
    const ok = notificationSettingsSchema.safeParse({
      levels: { events: 'off', system: 'all' },
      directMessagePush: true,
    });
    expect(ok.success).toBe(true);
    const refused = notificationSettingsSchema.safeParse({
      levels: { system: 'app' },
      directMessagePush: true,
    });
    expect(refused.success).toBe(false);
    expect(
      notificationSettingsSchema.safeParse({ levels: { nonsense: 'off' }, directMessagePush: true })
        .success,
    ).toBe(false);
  });
});
