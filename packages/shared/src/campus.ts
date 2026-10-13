/**
 * Campus life: events (with RSVP), the map of offices and facilities, and later jobs, lost &
 * found and transport. Offices publish events directly; a student's or teacher's event waits for
 * Student Affairs.
 */
import { addDays, formatClock, toMinutes, weekdayOf } from './academics';

export const EVENT_CATEGORIES = [
  'seminar',
  'workshop',
  'competition',
  'sports',
  'cultural',
  'career',
  'society',
  'other',
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  seminar: 'Seminar or talk',
  workshop: 'Workshop',
  competition: 'Competition',
  sports: 'Sports',
  cultural: 'Cultural',
  career: 'Careers',
  society: 'Society meetup',
  other: 'Other',
};

export const EVENT_STATUSES = ['pending', 'published', 'rejected', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  pending: 'Waiting for Student Affairs',
  published: 'Published',
  rejected: 'Not approved',
  cancelled: 'Cancelled',
};

export const RSVP_STATUSES = ['going', 'interested'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

/** Seats left, or null when the event has no limit. */
export const seatsLeft = (event: { capacity: number | null; going: number }) =>
  event.capacity === null ? null : Math.max(0, event.capacity - event.going);

// ---- Jobs and internships ----

export const JOB_KINDS = ['internship', 'part-time', 'graduate', 'research'] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_KIND_LABELS: Record<JobKind, string> = {
  internship: 'Internship',
  'part-time': 'Part-time',
  graduate: 'Graduate job',
  research: 'Research assistant',
};

/** People who saved a job hear about its deadline this many days before. */
export const JOB_DEADLINE_REMINDER_DAYS = 2;

/** Only web links may be followed from a job post (no `javascript:` and the like). */
export const isWebLink = (url: string) => /^https?:\/\//i.test(url);

// ---- Lost & found ----

export const LOST_FOUND_KINDS = ['lost', 'found'] as const;
export type LostFoundKind = (typeof LOST_FOUND_KINDS)[number];

export const ITEM_CATEGORIES = [
  'electronics',
  'cards',
  'bags',
  'books',
  'keys',
  'clothing',
  'bottles',
  'other',
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  electronics: 'Phones, laptops and chargers',
  cards: 'ID cards and wallets',
  bags: 'Bags',
  books: 'Books and notes',
  keys: 'Keys',
  clothing: 'Clothing',
  bottles: 'Bottles and lunch boxes',
  other: 'Something else',
};

// ---- Transport ----

/**
 * A stop on a bus route, listed from the farthest stop to campus: the morning run picks people
 * up in that order, and the evening run drops them off in reverse.
 */
export interface BusStop {
  name: string;
  /** Morning pick-up time at this stop. */
  morning: string;
  /** Evening drop-off time at this stop. */
  evening: string;
}

export interface NextBus {
  run: 'morning' | 'evening';
  date: string;
  time: string;
}

/** The next time a route's bus is at a stop, from `now` (campus time); null if it never runs. */
export function nextBus(
  route: { days: readonly number[]; stops: readonly BusStop[] },
  stopName: string,
  now: { date: string; minutes: number },
): NextBus | null {
  const stop = route.stops.find((s) => s.name === stopName);
  if (!stop || !route.days.length) return null;
  for (let ahead = 0; ahead < 8; ahead++) {
    const date = addDays(now.date, ahead);
    if (!route.days.includes(weekdayOf(date))) continue;
    const runs: NextBus[] = [
      { run: 'morning', date, time: stop.morning },
      { run: 'evening', date, time: stop.evening },
    ];
    const next = runs.find((r) => ahead > 0 || toMinutes(r.time) > now.minutes);
    if (next) return next;
  }
  return null;
}

// ---- Campus map: offices and facilities ----

export const PLACE_KINDS = ['office', 'facility'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

/** Open on these ISO weekdays (1 = Monday … 7 = Sunday) between two campus times. */
export interface OpeningHours {
  days: readonly number[];
  open: string;
  close: string;
}

export function isOpenAt(
  hours: readonly OpeningHours[],
  weekday: number,
  minutes: number,
): boolean {
  return hours.some(
    (h) => h.days.includes(weekday) && toMinutes(h.open) <= minutes && minutes < toMinutes(h.close),
  );
}

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** `[1,2,3,4,5]` → `Mon–Fri`, `[1,3]` → `Mon, Wed`, all seven → `Every day`. */
export function describeDays(days: readonly number[]): string {
  const sorted = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (sorted.length === 7) return 'Every day';
  const runs: string[] = [];
  let start = sorted[0];
  for (let i = 0; i < sorted.length; i++) {
    const day = sorted[i] as number;
    const next = sorted[i + 1];
    if (next === day + 1) continue;
    if (start === undefined) break;
    runs.push(
      day - start >= 2
        ? `${DAY_NAMES[start]}–${DAY_NAMES[day]}`
        : day === start
          ? `${DAY_NAMES[day]}`
          : `${DAY_NAMES[start]}, ${DAY_NAMES[day]}`,
    );
    start = next;
  }
  return runs.join(', ');
}

/** `Mon–Fri 8:30 AM–4:30 PM · Sat 9:00 AM–1:00 PM`. */
export function describeHours(hours: readonly OpeningHours[]): string {
  return hours
    .map((h) => `${describeDays(h.days)} ${formatClock(h.open)}–${formatClock(h.close)}`)
    .join(' · ');
}
