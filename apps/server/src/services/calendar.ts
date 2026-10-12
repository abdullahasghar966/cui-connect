/**
 * The academic calendar (holidays, exam periods, registration, deadlines), kept by the Director's
 * Office, and each person's own calendar: their classes, their papers and the academic dates.
 * A holiday cancels that day's classes everywhere the timetable is shown.
 */
import {
  addDays,
  CALENDAR_KIND_LABELS,
  type CalendarEventDTO,
  type CalendarEventInput,
  type CalendarItemDTO,
  calendarEventSchema,
  canManageCalendar,
  EXAM_KIND_LABELS,
  formatShortDate,
} from '@cui/shared';
import { assertAllowed, notFound, parse } from '../lib/errors';
import { CalendarEvent, type CalendarEventDoc, User, type UserDoc } from '../models';
import { broadcastTimetableChanged } from '../realtime/notifier';
import { recordAudit } from './audit';
import { myExams } from './exams';
import { toObjectId, toPolicyUser } from './mappers';
import { notify } from './notifications';
import { myOccurrences } from './timetable';

export function toCalendarEventDTO(e: CalendarEventDoc): CalendarEventDTO {
  return {
    id: String(e._id),
    title: e.title,
    kind: e.kind,
    startsOn: e.startsOn,
    endsOn: e.endsOn,
    description: e.description,
  };
}

const overlapping = (from: string, to: string) => ({
  startsOn: { $lte: to },
  endsOn: { $gte: from },
});

export async function listCalendar(from: string, to: string): Promise<CalendarEventDTO[]> {
  const events = await CalendarEvent.find(overlapping(from, to))
    .sort({ startsOn: 1, title: 1 })
    .lean<CalendarEventDoc[]>();
  return events.map(toCalendarEventDTO);
}

const span = (e: Pick<CalendarEventDoc, 'startsOn' | 'endsOn'>) =>
  e.startsOn === e.endsOn
    ? formatShortDate(e.startsOn)
    : `${formatShortDate(e.startsOn)} – ${formatShortDate(e.endsOn)}`;

/** Everyone on campus who uses the timetable (students and teachers). */
async function campusPeople() {
  return User.find({ active: true, role: { $in: ['student', 'faculty'] } }).distinct('_id');
}

export async function saveCalendarEvent(
  actor: UserDoc,
  eventId: string | null,
  input: CalendarEventInput,
): Promise<CalendarEventDTO> {
  assertAllowed(canManageCalendar(toPolicyUser(actor)));
  const data = parse(calendarEventSchema, input);
  const fields = { ...data, description: data.description || null };
  const before = eventId
    ? await CalendarEvent.findById(toObjectId(eventId)).lean<CalendarEventDoc>()
    : null;
  if (eventId && !before) throw notFound('Calendar entry not found.');
  const saved = before
    ? await CalendarEvent.findByIdAndUpdate(
        before._id,
        { $set: fields },
        { returnDocument: 'after' },
      ).lean<CalendarEventDoc>()
    : (
        await CalendarEvent.create({ ...fields, createdById: actor._id })
      ).toObject<CalendarEventDoc>();
  if (!saved) throw notFound('Calendar entry not found.');

  void recordAudit({
    action: before ? 'calendar.updated' : 'calendar.created',
    actor,
    summary: `${actor.name} ${before ? 'changed' : 'added'} "${saved.title}" (${span(saved)}) on the academic calendar`,
    targetType: 'calendar',
    targetId: saved._id,
  });
  // A new or moved holiday changes everyone's classes: tell them and refresh timetables.
  const holidayChanged =
    (saved.kind === 'holiday' || before?.kind === 'holiday') &&
    (!before ||
      before.startsOn !== saved.startsOn ||
      before.endsOn !== saved.endsOn ||
      before.kind !== saved.kind);
  if (holidayChanged) {
    if (saved.kind === 'holiday') {
      await notify(await campusPeople(), {
        type: 'events',
        title: `Holiday: ${saved.title}`,
        body: `${span(saved)}. No classes that day.`,
        link: '/academics/calendar',
        key: `holiday:${saved._id}:${saved.startsOn}:${saved.endsOn}`,
      });
    }
    broadcastTimetableChanged([]);
  }
  return toCalendarEventDTO(saved);
}

export async function deleteCalendarEvent(actor: UserDoc, eventId: string): Promise<void> {
  assertAllowed(canManageCalendar(toPolicyUser(actor)));
  const event = await CalendarEvent.findByIdAndDelete(toObjectId(eventId)).lean<CalendarEventDoc>();
  if (!event) throw notFound('Calendar entry not found.');
  void recordAudit({
    action: 'calendar.deleted',
    actor,
    summary: `${actor.name} removed "${event.title}" (${span(event)}) from the academic calendar`,
    targetType: 'calendar',
    targetId: event._id,
  });
  if (event.kind === 'holiday') broadcastTimetableChanged([]);
}

/** The viewer's own calendar between two dates: classes, papers and academic dates. */
export async function myCalendar(
  viewer: UserDoc,
  from: string,
  to: string,
): Promise<CalendarItemDTO[]> {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const [academic, classes, exams] = await Promise.all([
    CalendarEvent.find(overlapping(from, to)).lean<CalendarEventDoc[]>(),
    viewer.role === 'student' || viewer.role === 'faculty'
      ? myOccurrences(viewer, from, days)
      : Promise.resolve([]),
    myExams(viewer),
  ]);
  const items: CalendarItemDTO[] = [];
  for (const e of academic) {
    // One item per day it covers, so it shows on each day of the month view.
    for (
      let d = e.startsOn < from ? from : e.startsOn;
      d <= e.endsOn && d <= to;
      d = addDays(d, 1)
    ) {
      items.push({
        id: `academic-${e._id}-${d}`,
        kind: 'academic',
        title: e.title,
        detail: e.description ?? CALENDAR_KIND_LABELS[e.kind],
        date: d,
        start: null,
        end: null,
        link: null,
        status: null,
        category: e.kind,
        endsOn: e.endsOn === e.startsOn ? null : e.endsOn,
      });
    }
  }
  for (const c of classes) {
    // Suspended by a holiday or exam period: the academic entry already says so.
    if (c.suspended) continue;
    items.push({
      id: `class-${c.slot.id}-${c.date}`,
      kind: 'class',
      title: `${c.slot.code} ${c.slot.title}`,
      detail: [c.room?.name, c.slot.sectionName, c.note].filter(Boolean).join(' · ') || null,
      date: c.date,
      start: c.start,
      end: c.end,
      link: `/academics/timetable?week=${c.date}`,
      status: c.status === 'cancelled' ? 'cancelled' : c.status === 'moved-in' ? 'moved' : null,
      category: null,
      endsOn: null,
    });
  }
  for (const x of exams) {
    if (x.date < from || x.date > to) continue;
    items.push({
      id: `exam-${x.id}`,
      kind: 'exam',
      title: `${x.code} ${x.title} · ${EXAM_KIND_LABELS[x.kind]}`,
      detail: x.seat
        ? `${x.seat.room.name}, row ${x.seat.row}, seat ${x.seat.seat}`
        : x.rooms.map((r) => r.name).join(', ') || null,
      date: x.date,
      start: x.start,
      end: x.end,
      link: '/academics/exams',
      status: null,
      category: null,
      endsOn: null,
    });
  }
  return items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.start ?? '').localeCompare(b.start ?? '') ||
      a.title.localeCompare(b.title),
  );
}
