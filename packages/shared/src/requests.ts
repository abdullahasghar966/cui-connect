/**
 * Student requests and complaints: what can be asked for, who handles each kind, and how its
 * status may move. A request is a small case file with a timeline of status changes and replies.
 */
import { addDays } from './academics';
import type { Office } from './constants';

export const REQUEST_KINDS = ['leave', 'transcript', 'bonafide', 'idcard', 'complaint'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_KIND_LABELS: Record<RequestKind, string> = {
  leave: 'Leave application',
  transcript: 'Official transcript',
  bonafide: 'Bonafide certificate',
  idcard: 'Student ID card',
  complaint: 'Complaint',
};

/** Who handles each kind: leave goes to the student's batch advisor (or their department office). */
export const REQUEST_ROUTES: Record<RequestKind, Office | 'ADVISOR'> = {
  leave: 'ADVISOR',
  transcript: 'EXAM',
  bonafide: 'EXAM',
  idcard: 'STUDENT_AFFAIRS',
  complaint: 'STUDENT_AFFAIRS',
};

export const REQUEST_STATUSES = [
  'submitted',
  'in_review',
  'approved',
  'rejected',
  'completed',
  'withdrawn',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const FINAL_STATUSES: readonly RequestStatus[] = [
  'approved',
  'rejected',
  'completed',
  'withdrawn',
];

/** The words each status uses for this kind (a complaint is resolved, a letter is ready). */
export function requestStatusLabel(kind: RequestKind, status: RequestStatus): string {
  switch (status) {
    case 'submitted':
      return 'Submitted';
    case 'in_review':
      return kind === 'complaint' ? 'Being looked into' : 'In progress';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return kind === 'complaint' ? 'Closed' : 'Not approved';
    case 'completed':
      return kind === 'complaint' ? 'Resolved' : 'Ready to collect';
    case 'withdrawn':
      return 'Withdrawn';
  }
}

/** Where the person handling it can move a request next (nothing once it's final). */
export function nextStatuses(kind: RequestKind, status: RequestStatus): RequestStatus[] {
  if (FINAL_STATUSES.includes(status)) return [];
  if (kind === 'leave') return ['approved', 'rejected'];
  return status === 'submitted'
    ? ['in_review', 'completed', 'rejected']
    : ['completed', 'rejected'];
}

export const COMPLAINT_CATEGORIES = [
  'facilities',
  'transport',
  'cafeteria',
  'it',
  'academics',
  'harassment',
  'other',
] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const COMPLAINT_CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  facilities: 'Classrooms and facilities',
  transport: 'Transport',
  cafeteria: 'Cafeteria',
  it: 'Internet and computers',
  academics: 'Academic matters',
  harassment: 'Harassment or bullying',
  other: 'Something else',
};

export const ID_CARD_REASONS = ['lost', 'damaged', 'renewal'] as const;
export type IdCardReason = (typeof ID_CARD_REASONS)[number];

export const ID_CARD_REASON_LABELS: Record<IdCardReason, string> = {
  lost: 'Lost',
  damaged: 'Damaged',
  renewal: 'Expired or details changed',
};

/** Longest leave one application covers. */
export const LEAVE_MAX_DAYS = 14;

/** Days from `from` to `to`, both included. */
export function leaveDays(from: string, to: string): number {
  let days = 0;
  for (let d = from; d <= to && days <= 366; d = addDays(d, 1)) days++;
  return days;
}
