/**
 * Reminders, checked once a minute inside the server: the evening before a paper or a holiday,
 * the morning of a deadline or registration window and of office-hour appointments, and a day
 * before an assignment is due (to students who haven't handed it in), and unpaid fee challans
 * three days before and the day after their due date. Each reminder has a notification key,
 * so a restart (or the next minute) never sends it twice; an in-memory list skips the work.
 * (Free hosting sleeps when idle, so reminders go out while the site is awake.)
 */
import {
  addDays,
  amountOn,
  type CalendarKind,
  campusClock,
  EXAM_KIND_LABELS,
  FEE_INSTALMENT_LABELS,
  FEE_REMINDER_DAYS,
  feeTotal,
  formatClock,
  formatInstant,
  formatPKR,
  formatShortDate,
} from '@cui/shared';
import { logger } from '../lib/logger';
import {
  Assignment,
  type AssignmentDoc,
  Booking,
  type BookingDoc,
  CalendarEvent,
  type CalendarEventDoc,
  CampusEvent,
  type CampusEventDoc,
  CourseOffering,
  EventRsvp,
  Exam,
  type ExamDoc,
  FeeChallan,
  type FeeChallanDoc,
  Room,
  SeatAssignment,
  Submission,
  User,
} from '../models';
import { bookingPeople } from './bookings';
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

/** Students who haven't handed in an assignment due within a day (once per due time). */
async function assignmentsDueSoon(now: Date): Promise<number> {
  const soon = await Assignment.find({
    dueAt: { $gt: now, $lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
  }).lean<AssignmentDoc[]>();
  let sent = 0;
  for (const assignment of soon) {
    const job = `assignment:${assignment._id}:${assignment.dueAt.toISOString()}`;
    if (done.has(job)) continue;
    const [offering, handedIn] = await Promise.all([
      CourseOffering.findById(assignment.offeringId).select('title studentIds').lean(),
      Submission.find({ assignmentId: assignment._id }).distinct('studentId'),
    ]);
    const submitted = new Set(handedIn.map(String));
    const waiting = (offering?.studentIds ?? []).filter((id) => !submitted.has(String(id)));
    sent += await notify(waiting, {
      type: 'coursework',
      title: `Due soon: ${offering?.title ?? 'Assignment'} ${assignment.title}`,
      body: `Due ${formatInstant(assignment.dueAt.toISOString())}. You haven't handed it in yet.`,
      link: `/academics/assignments/${assignment._id}`,
      key: `remind:${job}`,
    });
    done.add(job);
  }
  return sent;
}

/** The morning of office-hour appointments: each student, and each teacher's list for the day. */
async function appointmentsToday(date: string): Promise<number> {
  const bookings = await Booking.find({ date, status: 'booked' })
    .sort({ start: 1 })
    .lean<BookingDoc[]>();
  const fresh = bookings.filter((b) => !done.has(`booking:${b._id}`));
  if (!fresh.length) return 0;
  const people = await bookingPeople(bookings);
  let sent = 0;
  for (const b of fresh) {
    const teacher = people.get(String(b.teacherId));
    sent += await notify([b.studentId], {
      type: 'bookings',
      title: `Today at ${formatClock(b.start)}: office hours with ${teacher?.name ?? 'your teacher'}`,
      body: [teacher?.officeLocation, b.topic].filter(Boolean).join(' · '),
      link: '/academics/teachers?tab=appointments',
      key: `remind:booking:${b._id}`,
    });
    done.add(`booking:${b._id}`);
  }
  const byTeacher = new Map<string, BookingDoc[]>();
  for (const b of bookings) {
    byTeacher.set(String(b.teacherId), [...(byTeacher.get(String(b.teacherId)) ?? []), b]);
  }
  for (const [teacherId, list] of byTeacher) {
    sent += await notify([teacherId], {
      type: 'bookings',
      title: `Office hours today: ${list.length} appointment${list.length === 1 ? '' : 's'}`,
      body: list
        .map((b) => `${formatClock(b.start)} ${people.get(String(b.studentId))?.name ?? 'Student'}`)
        .join(', '),
      link: '/academics/teachers?tab=appointments',
      // Once a day (a booking made later that morning shows on the Appointments tab).
      key: `remind:bookings:${teacherId}:${date}`,
    });
  }
  return sent;
}

/** The evening before a campus event: everyone going. */
async function eventsTomorrow(date: string): Promise<number> {
  const events = await CampusEvent.find({ status: 'published', date }).lean<CampusEventDoc[]>();
  let sent = 0;
  for (const event of events) {
    const job = `event:${event._id}:${event.date}:${event.start}`;
    if (done.has(job)) continue;
    const going = await EventRsvp.find({ eventId: event._id, status: 'going' }).distinct('userId');
    sent += await notify(going, {
      type: 'events',
      title: `Tomorrow: ${event.title} at ${formatClock(event.start)}`,
      body: `${event.venue} · ${event.organiser}`,
      link: `/campus/events/${event._id}`,
      key: `remind:${job}`,
    });
    done.add(job);
  }
  return sent;
}

/** Unpaid fee challans: a few days before the due date, and the morning after it (late fee). */
async function feeReminders(date: string): Promise<number> {
  const soon = addDays(date, FEE_REMINDER_DAYS);
  const lateSince = addDays(date, -1);
  const challans = await FeeChallan.find({
    paidOn: null,
    dueDate: { $in: [soon, lateSince] },
  }).lean<FeeChallanDoc[]>();
  let sent = 0;
  for (const c of challans) {
    const overdue = c.dueDate === lateSince;
    const job = `fees:${overdue ? 'late' : 'soon'}:${c._id}:${c.dueDate}`;
    if (done.has(job)) continue;
    const what = `${FEE_INSTALMENT_LABELS[c.instalment]} (challan ${c.challanNo})`;
    sent += await notify([c.studentId], {
      type: 'fees',
      title: overdue
        ? `Fee overdue: now ${formatPKR(amountOn(c, date))}`
        : `Fee due in ${FEE_REMINDER_DAYS} days: ${formatPKR(feeTotal(c.items))}`,
      body: overdue
        ? `${what} was due ${formatShortDate(c.dueDate)}.${c.lateFee ? ` A late fee of ${formatPKR(c.lateFee)} has been added.` : ''} Pay at the bank as soon as you can.`
        : `${what}, due ${formatShortDate(c.dueDate)}.${c.lateFee ? ` A late fee of ${formatPKR(c.lateFee)} applies after that.` : ''}`,
      link: '/services/fees',
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
    sent += await eventsTomorrow(tomorrow);
  }
  if (clock.minutes >= MORNING) {
    sent += await calendarDay(clock.date, ['deadline', 'registration'], 'Today');
    sent += await appointmentsToday(clock.date);
    sent += await feeReminders(clock.date);
  }
  sent += await assignmentsDueSoon(now);
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
