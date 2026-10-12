import { describe, expect, it } from 'vitest';
import { campusEventSchema } from './academic-schemas';
import { canPublishEvent } from './access';
import { describeDays, describeHours, isOpenAt, seatsLeft } from './campus';
import type { PolicyUser } from './policy';

describe('campus events', () => {
  it('counts places left only when there is a limit', () => {
    expect(seatsLeft({ capacity: 12, going: 11 })).toBe(1);
    expect(seatsLeft({ capacity: 12, going: 14 })).toBe(0);
    expect(seatsLeft({ capacity: null, going: 400 })).toBeNull();
  });

  it('lets offices and IT publish directly; students and teachers wait for Student Affairs', () => {
    const user = (u: Partial<PolicyUser> & Pick<PolicyUser, 'id' | 'role'>): PolicyUser => ({
      active: true,
      departmentId: null,
      ...u,
    });
    expect(canPublishEvent(user({ id: 'a', role: 'admin' })).allowed).toBe(true);
    expect(canPublishEvent(user({ id: 'e', role: 'staff', office: 'EXAM' })).allowed).toBe(true);
    expect(canPublishEvent(user({ id: 'f', role: 'faculty' })).allowed).toBe(false);
    expect(canPublishEvent(user({ id: 's', role: 'student' })).allowed).toBe(false);
    expect(canPublishEvent(user({ id: 'x', role: 'staff', active: false })).allowed).toBe(false);
  });

  it('knows when an office is open and says its hours plainly', () => {
    const hours = [
      { days: [1, 2, 3, 4, 5], open: '08:30', close: '16:30' },
      { days: [6], open: '09:00', close: '13:00' },
    ];
    expect(isOpenAt(hours, 1, 8 * 60 + 30)).toBe(true);
    expect(isOpenAt(hours, 1, 16 * 60 + 30)).toBe(false);
    expect(isOpenAt(hours, 6, 12 * 60)).toBe(true);
    expect(isOpenAt(hours, 7, 12 * 60)).toBe(false);
    expect(isOpenAt([], 1, 600)).toBe(false);
    expect(describeHours(hours)).toBe('Mon–Fri 8:30 AM–4:30 PM · Sat 9:00 AM–1:00 PM');
    expect(describeDays([1, 2, 3, 4, 5, 6, 7])).toBe('Every day');
    expect(describeDays([3, 1])).toBe('Mon, Wed');
    expect(describeDays([1, 2])).toBe('Mon, Tue');
    expect(describeDays([1, 2, 3, 5])).toBe('Mon–Wed, Fri');
  });

  it('needs an event to end after it starts', () => {
    const event = {
      title: 'Career Fair',
      description: 'Companies hiring for internships.',
      category: 'career',
      date: '2026-10-21',
      start: '10:00',
      end: '16:00',
      venue: 'Main Auditorium',
      organiser: 'Student Affairs',
    };
    expect(campusEventSchema.safeParse(event).success).toBe(true);
    expect(campusEventSchema.safeParse({ ...event, end: '09:00' }).success).toBe(false);
    expect(campusEventSchema.safeParse({ ...event, capacity: 0 }).success).toBe(false);
  });
});
