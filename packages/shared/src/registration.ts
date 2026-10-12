/**
 * Course registration for the coming term: what a student may pick, and why not. The same
 * checks run in the browser while a student builds their plan and on the server, which decides.
 * Blocking problems stop a plan from being sent; warnings go to the batch advisor with it.
 */
import { formatClock, timesOverlap, WEEKDAY_SHORT, type Weekday } from './academics';

/** Most credit hours one student may take in a regular term. */
export const MAX_CREDITS = 21;
/** Below this a student studies part-time (allowed, with a warning). */
export const MIN_CREDITS = 12;

export const REGISTRATION_STATUSES = ['draft', 'submitted', 'approved', 'returned'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  draft: 'Not sent yet',
  submitted: 'Waiting for approval',
  approved: 'Approved',
  returned: 'Returned for changes',
};

/** Who opens registration: the academic calendar's dates, or the office by hand. */
export const REGISTRATION_MODES = ['calendar', 'open', 'closed'] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

export interface OfferSlot {
  day: number;
  start: string;
  end: string;
}

export interface OfferLike {
  id: string;
  code: string;
  title: string;
  sectionName: string;
  credits: number;
  prerequisites: readonly string[];
  slots: readonly OfferSlot[];
  seatsLeft: number;
}

export interface StudentRecordLike {
  /** Courses passed (latest attempt). */
  passed: readonly string[];
  /** Courses being taken this term (counted as provisionally passed). */
  inProgress: readonly string[];
}

export interface RegistrationIssue {
  level: 'block' | 'warn';
  /** The course it is about, if any. */
  code: string | null;
  message: string;
}

export const slotLabel = (slot: OfferSlot) =>
  `${WEEKDAY_SHORT[slot.day as Weekday] ?? `Day ${slot.day}`} ${formatClock(slot.start)}`;

/** `Mon, Wed 8:30 AM` style summary of an offer's weekly meetings. */
export function describeSlots(slots: readonly OfferSlot[]): string {
  if (!slots.length) return 'Times to be announced';
  return [...slots]
    .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))
    .map(
      (s) =>
        `${WEEKDAY_SHORT[s.day as Weekday] ?? `Day ${s.day}`} ${formatClock(s.start)}–${formatClock(s.end)}`,
    )
    .join(' · ');
}

/**
 * Everything wrong with a plan. `held` lists offers that already hold one of this student's seats
 * (a sent plan), so a full section they are already in doesn't count against them.
 */
export function checkRegistration(
  offers: readonly OfferLike[],
  record: StudentRecordLike,
  held: readonly string[] = [],
): { credits: number; issues: RegistrationIssue[] } {
  const issues: RegistrationIssue[] = [];
  const passed = new Set(record.passed);
  const inProgress = new Set(record.inProgress);
  const credits = offers.reduce((sum, o) => sum + o.credits, 0);

  if (!offers.length) {
    issues.push({ level: 'block', code: null, message: 'Pick at least one course.' });
  }
  const seen = new Set<string>();
  for (const offer of offers) {
    if (seen.has(offer.code)) {
      issues.push({
        level: 'block',
        code: offer.code,
        message: `${offer.code} is in your plan twice. Keep one section.`,
      });
    }
    seen.add(offer.code);
    if (passed.has(offer.code)) {
      issues.push({
        level: 'block',
        code: offer.code,
        message: `You have already passed ${offer.code}.`,
      });
    }
    if (inProgress.has(offer.code)) {
      issues.push({
        level: 'warn',
        code: offer.code,
        message: `You are taking ${offer.code} this term. Register again only if you expect to repeat it.`,
      });
    }
    for (const pre of offer.prerequisites) {
      if (passed.has(pre)) continue;
      issues.push(
        inProgress.has(pre)
          ? {
              level: 'warn',
              code: offer.code,
              message: `${offer.code} needs ${pre}, which you are taking this term. If you don't pass it, ${offer.code} will be dropped.`,
            }
          : { level: 'block', code: offer.code, message: `${offer.code} needs ${pre} first.` },
      );
    }
    if (offer.seatsLeft <= 0 && !held.includes(offer.id)) {
      issues.push({
        level: 'block',
        code: offer.code,
        message: `${offer.code} (${offer.sectionName}) is full. Pick another section.`,
      });
    }
  }

  // Two courses at the same time (each pair once).
  for (const [i, a] of offers.entries()) {
    for (const b of offers.slice(i + 1)) {
      if (a.code === b.code) continue;
      const clash = a.slots.find((sa) =>
        b.slots.some((sb) => sb.day === sa.day && timesOverlap(sa.start, sa.end, sb.start, sb.end)),
      );
      if (clash) {
        issues.push({
          level: 'block',
          code: b.code,
          message: `${a.code} and ${b.code} meet at the same time (${slotLabel(clash)}).`,
        });
      }
    }
  }

  if (credits > MAX_CREDITS) {
    issues.push({
      level: 'block',
      code: null,
      message: `That's ${credits} credit hours; the most you can take is ${MAX_CREDITS}.`,
    });
  } else if (offers.length && credits < MIN_CREDITS) {
    issues.push({
      level: 'warn',
      code: null,
      message: `${credits} credit hours is below ${MIN_CREDITS}, so you would study part-time this term.`,
    });
  }
  return { credits, issues };
}

export const canSubmit = (issues: readonly RegistrationIssue[]) =>
  !issues.some((issue) => issue.level === 'block');
