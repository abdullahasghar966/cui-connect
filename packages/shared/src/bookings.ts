/**
 * Office-hour appointments: a teacher's weekly office hours are cut into short slots that
 * students can book, up to two weeks ahead.
 */
import { toMinutes, weekdayOf } from './academics';

/** Length of one appointment. */
export const BOOKING_MINUTES = 15;
/** How far ahead students can book. */
export const BOOKING_DAYS_AHEAD = 14;
/** Upcoming appointments one student may hold at a time (all teachers together). */
export const MAX_OPEN_BOOKINGS = 3;

export const BOOKING_STATUSES = ['booked', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** The appointment slots on `date` inside these weekly office hours, earliest first. */
export function officeHourSlots(
  hours: readonly { day: number; start: string; end: string }[],
  date: string,
  minutes = BOOKING_MINUTES,
): { start: string; end: string }[] {
  const day = weekdayOf(date);
  const slots: { start: string; end: string }[] = [];
  for (const h of hours.filter((x) => x.day === day)) {
    for (let t = toMinutes(h.start); t + minutes <= toMinutes(h.end); t += minutes) {
      slots.push({ start: clock(t), end: clock(t + minutes) });
    }
  }
  return slots
    .sort((a, b) => a.start.localeCompare(b.start))
    .filter((s, i, list) => i === 0 || list[i - 1]?.start !== s.start);
}
