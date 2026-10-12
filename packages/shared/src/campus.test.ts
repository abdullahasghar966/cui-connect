import { describe, expect, it } from 'vitest';
import { campusEventSchema } from './academic-schemas';
import { canPublishEvent } from './access';
import { seatsLeft } from './campus';
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
