/**
 * Campus life: events (with RSVP), and later the map, jobs, lost & found and transport.
 * Offices publish events directly; a student's or teacher's event waits for Student Affairs.
 */

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
