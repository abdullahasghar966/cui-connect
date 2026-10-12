/**
 * Reminders, checked once a minute inside the server: the evening before a paper or a holiday,
 * and the morning of a deadline or registration window. Each reminder has a notification key,
 * so a restart (or the next minute) never sends it twice; an in-memory list skips the work.
 * (Free hosting sleeps when idle, so reminders go out while the site is awake.)
 */
import {
  addDays,
  type CalendarKind,
  campusClock,
  EXAM_KIND_LABELS,
  formatClock,
  formatShortDate,
} from '@cui/shared';
import { logger } from '../lib/logger';
import {
  CalendarEvent,
  type CalendarEventDoc,
  CourseOffering,
  Exam,
  type ExamDoc,
  Room,
  SeatAssignment,
  User,
} from '../models';
import { notify } from './notifications';

const EVENING = 18 * 60;
const MORNING = 8 * 60;

/** Work already done by this process, so the minute timer doesn't redo it. */
const done = new Set<string>();

async function examsTomorrow(date: string): Promise<number> {
  const exams = await Exam.find({ date, published: true }).lean<ExamDoc[]>();
  let sent = 0;
  for (const exam of exams) {
    const job = `exam:${exam._id}:${exam.date}:${exam.start}`;
    if (done.has(job)) continue;
    const [offerings, seats] = await Promise.all([
      CourseOffering.find({ _id: { $in: exam.offeringIds } })
        .select('studentIds')
        .lean(),
      SeatAssignment.find({ examId: exam._id }).lean(),
    ]);
    const rooms = new Map(
      (
        await Room.find({ _id: { $in: exam.roomIds } })
          .select('name')
          .lean()
      ).map((r) => [String(r._id), r.name]),
    );
    const seatOf = new Map(seats.map((s) => [String(s.studentId), s]));
    const students = new Set(offerings.flatMap((o) => o.studentIds.map(String)));
    for (const studentId of students) {
      const seat = seatOf.get(studentId);
      const where = seat
        ? `${rooms.get(String(seat.roomId)) ?? 'Room'}, row ${seat.row}, seat ${seat.seat}`
        : [...rooms.values()].join(', ') || 'room to be announced';
      sent += await notify([studentId], {
        type: 'exams',
        title: `Tomorrow: ${exam.code} ${EXAM_KIND_LABELS[exam.kind]} at ${formatClock(exam.start)}`,
        body: `${exam.title}, ${formatShortDate(exam.date)} · ${where}. Bring your student ID.`,
        link: '/academics/exams',
        key: `remind:${job}`,
      });
    }
    done.add(job);
  }
  return sent;
}

async function calendarDay(date: string, kinds: CalendarKind[], word: string): Promise<number> {
  const events = await CalendarEvent.find({ kind: { $in: kinds }, startsOn: date }).lean<
    CalendarEventDoc[]
  >();
  let sent = 0;
  for (const event of events) {
    const job = `calendar:${event._id}:${date}`;
    if (done.has(job)) continue;
    const people = await User.find({
      active: true,
      role: { $in: ['student', 'faculty'] },
    }).distinct('_id');
    sent += await notify(people, {
      type: 'events',
      title: `${word}: ${event.title}`,
      body:
        event.kind === 'holiday'
          ? 'No classes. Enjoy the day off.'
          : (event.description ??
            (event.endsOn === event.startsOn
              ? formatShortDate(event.startsOn)
              : `Until ${formatShortDate(event.endsOn)}.`)),
      link: '/academics/calendar',
      key: `remind:${job}`,
    });
    done.add(job);
  }
  return sent;
}

/** Sends whatever is due at `now` (campus time). Safe to call any number of times. */
export async function runReminders(now = new Date()): Promise<number> {
  const clock = campusClock(now);
  let sent = 0;
  if (clock.minutes >= EVENING) {
    const tomorrow = addDays(clock.date, 1);
    sent += await examsTomorrow(tomorrow);
    sent += await calendarDay(tomorrow, ['holiday'], 'Tomorrow is a holiday');
  }
  if (clock.minutes >= MORNING) {
    sent += await calendarDay(clock.date, ['deadline', 'registration'], 'Today');
  }
  return sent;
}

/** Starts the once-a-minute check; returns a function that stops it. */
export function startReminderScheduler(): () => void {
  const tick = () => {
    runReminders().catch((err) => logger.error({ err }, 'Reminder check failed'));
  };
  const first = setTimeout(tick, 10_000);
  const timer = setInterval(tick, 60_000);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}

/** For tests: forget what this process has already sent. */
export function resetReminderMemory(): void {
  done.clear();
}
