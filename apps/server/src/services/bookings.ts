/**
 * Office-hour appointments. A teacher's weekly office hours are cut into 15-minute slots that
 * students can book up to two weeks ahead, but only where the messaging rules already let the
 * student contact that teacher (the same `canDM` decision as direct messages). Both people are
 * told about a booking or a cancellation, and reminded on the day (reminders.ts).
 */
import {
  addDays,
  BOOKING_DAYS_AHEAD,
  type BookingDTO,
  type BookingInput,
  bookingSchema,
  type CancelBookingInput,
  campusClock,
  cancelBookingSchema,
  formatClock,
  formatShortDate,
  MAX_OPEN_BOOKINGS,
  officeHourSlots,
  type TeacherSlotsDTO,
  toMinutes,
} from '@cui/shared';
import type { Types } from 'mongoose';
import {
  badRequest,
  conflict,
  forbidden,
  isDuplicateKeyError,
  notFound,
  parse,
} from '../lib/errors';
import { Booking, type BookingDoc, CalendarEvent, User, type UserDoc } from '../models';
import { messageableIds } from './direct';
import { sameId, toObjectId } from './mappers';
import { notify } from './notifications';

type Person = Pick<UserDoc, '_id' | 'name' | 'regNo' | 'officeLocation'>;

export function toBookingDTO(b: BookingDoc, teacher?: Person, student?: Person): BookingDTO {
  return {
    id: String(b._id),
    teacher: { id: String(b.teacherId), name: teacher?.name ?? 'Former teacher' },
    student: {
      id: String(b.studentId),
      name: student?.name ?? 'Former student',
      regNo: student?.regNo ?? null,
    },
    date: b.date,
    start: b.start,
    end: b.end,
    topic: b.topic,
    location: teacher?.officeLocation ?? null,
    status: b.status,
    cancelledBy: b.cancelledById
      ? sameId(b.cancelledById, b.teacherId)
        ? 'teacher'
        : 'student'
      : null,
    cancelReason: b.cancelReason,
    createdAt: b.createdAt.toISOString(),
  };
}

/** Names and offices of the people in these appointments. */
export async function bookingPeople(bookings: BookingDoc[]): Promise<Map<string, Person>> {
  const ids = [...new Set(bookings.flatMap((b) => [String(b.teacherId), String(b.studentId)]))];
  const people = await User.find({ _id: { $in: ids.map((id) => toObjectId(id)) } })
    .select('name regNo officeLocation')
    .lean<Person[]>();
  return new Map(people.map((p) => [String(p._id), p]));
}

async function loadTeacher(teacherId: string): Promise<UserDoc> {
  const teacher = await User.findOne({
    _id: toObjectId(teacherId),
    role: 'faculty',
    active: true,
  }).lean<UserDoc>();
  if (!teacher) throw notFound('Teacher not found.');
  return teacher;
}

/** Public holidays between two dates: no office hours on those days. */
async function holidaysBetween(from: string, to: string) {
  return CalendarEvent.find({ kind: 'holiday', startsOn: { $lte: to }, endsOn: { $gte: from } })
    .select('startsOn endsOn')
    .lean<{ startsOn: string; endsOn: string }[]>();
}

const offDay = (holidays: { startsOn: string; endsOn: string }[], date: string) =>
  holidays.some((h) => h.startsOn <= date && date <= h.endsOn);

/** Why this person can't book with this teacher, in plain words; null when they can. */
async function bookingBlock(viewer: UserDoc, teacher: UserDoc): Promise<string | null> {
  if (viewer.role !== 'student') return 'Office hours are booked by students.';
  if (!teacher.officeHours?.length) return `${teacher.name} has not listed office hours yet.`;
  const allowed = await messageableIds(viewer, [teacher]);
  if (!allowed.has(String(teacher._id))) {
    return `The campus messaging rules don't let you contact ${teacher.name} directly, so you can't book their office hours.`;
  }
  return null;
}

const started = (b: Pick<BookingDoc, 'date' | 'start'>, clock = campusClock()) =>
  b.date < clock.date || (b.date === clock.date && toMinutes(b.start) <= clock.minutes);

/** A teacher's office-hour slots for the next two weeks, as the viewer sees them. */
export async function teacherSlots(viewer: UserDoc, teacherId: string): Promise<TeacherSlotsDTO> {
  const teacher = await loadTeacher(teacherId);
  const reason = await bookingBlock(viewer, teacher);
  const clock = campusClock();
  const last = addDays(clock.date, BOOKING_DAYS_AHEAD - 1);
  const [holidays, booked] = await Promise.all([
    holidaysBetween(clock.date, last),
    Booking.find({
      teacherId: teacher._id,
      status: 'booked',
      date: { $gte: clock.date, $lte: last },
    }).lean<BookingDoc[]>(),
  ]);
  const days: TeacherSlotsDTO['days'] = [];
  for (let i = 0; i < BOOKING_DAYS_AHEAD; i++) {
    const date = addDays(clock.date, i);
    if (offDay(holidays, date)) continue;
    const slots = officeHourSlots(teacher.officeHours ?? [], date);
    if (!slots.length) continue;
    days.push({
      date,
      slots: slots.map((slot) => {
        const holder = booked.find((b) => b.date === date && b.start === slot.start);
        return {
          ...slot,
          taken: !!holder || started({ date, start: slot.start }, clock),
          mine: !!holder && sameId(holder.studentId, viewer._id),
        };
      }),
    });
  }
  return {
    teacher: {
      id: String(teacher._id),
      name: teacher.name,
      officeLocation: teacher.officeLocation ?? null,
    },
    canBook: !reason,
    reason,
    days,
  };
}

export async function bookSlot(student: UserDoc, input: BookingInput): Promise<BookingDTO> {
  const data = parse(bookingSchema, input);
  const teacher = await loadTeacher(data.teacherId);
  const reason = await bookingBlock(student, teacher);
  if (reason) throw forbidden(reason);

  const clock = campusClock();
  if (data.date < clock.date || data.date > addDays(clock.date, BOOKING_DAYS_AHEAD - 1)) {
    throw badRequest('Book a time in the next two weeks.');
  }
  const slot = officeHourSlots(teacher.officeHours ?? [], data.date).find(
    (s) => s.start === data.start,
  );
  if (!slot) throw badRequest(`That time is not in ${teacher.name}'s office hours.`);
  if (started({ date: data.date, start: slot.start }, clock)) {
    throw badRequest('That time has already passed.');
  }
  if (offDay(await holidaysBetween(data.date, data.date), data.date)) {
    throw badRequest(`${formatShortDate(data.date)} is a holiday.`);
  }
  const upcoming = (
    await Booking.find({
      studentId: student._id,
      status: 'booked',
      date: { $gte: clock.date },
    }).lean<BookingDoc[]>()
  ).filter((b) => !started({ date: b.date, start: b.end }, clock));
  if (upcoming.some((b) => sameId(b.teacherId, teacher._id) && b.date === data.date)) {
    throw badRequest(`You already have an appointment with ${teacher.name} that day.`);
  }
  if (upcoming.length >= MAX_OPEN_BOOKINGS) {
    throw badRequest(
      `You can have ${MAX_OPEN_BOOKINGS} upcoming appointments at a time. Cancel one first.`,
    );
  }

  let booking: BookingDoc;
  try {
    booking = (
      await Booking.create({
        teacherId: teacher._id,
        studentId: student._id,
        date: data.date,
        start: slot.start,
        end: slot.end,
        topic: data.topic,
      })
    ).toObject<BookingDoc>();
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw conflict('Someone has just booked that time. Please pick another slot.');
    }
    throw err;
  }
  await notify([teacher._id], {
    type: 'bookings',
    title: `Office hours booked: ${student.name}`,
    body: `${formatShortDate(booking.date)} at ${formatClock(booking.start)} · ${booking.topic}`,
    link: '/academics/teachers?tab=appointments',
    key: `booking:${booking._id}:new`,
  });
  return toBookingDTO(booking, teacher, student);
}

/** The viewer's appointments from two weeks ago on (students: theirs; teachers: with them). */
export async function myBookings(viewer: UserDoc): Promise<BookingDTO[]> {
  const from = addDays(campusClock().date, -14);
  const filter = viewer.role === 'faculty' ? { teacherId: viewer._id } : { studentId: viewer._id };
  const bookings = await Booking.find({ ...filter, date: { $gte: from } })
    .sort({ date: 1, start: 1 })
    .lean<BookingDoc[]>();
  const people = await bookingPeople(bookings);
  return bookings.map((b) =>
    toBookingDTO(b, people.get(String(b.teacherId)), people.get(String(b.studentId))),
  );
}

/** Either person can cancel before it starts; the other one is told. */
export async function cancelBooking(
  viewer: UserDoc,
  bookingId: string,
  input: CancelBookingInput,
): Promise<BookingDTO> {
  const booking = await Booking.findById(toObjectId(bookingId)).lean<BookingDoc>();
  const isTeacher = !!booking && sameId(booking.teacherId, viewer._id);
  const isStudent = !!booking && sameId(booking.studentId, viewer._id);
  // Someone else's appointment doesn't exist as far as you're concerned.
  if (!booking || (!isTeacher && !isStudent)) throw notFound('Appointment not found.');
  if (booking.status !== 'booked') throw badRequest('This appointment is already cancelled.');
  if (started(booking)) throw badRequest('This appointment has already started.');
  const { reason } = parse(cancelBookingSchema, input);

  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'booked' },
    { $set: { status: 'cancelled', cancelledById: viewer._id, cancelReason: reason || null } },
    { returnDocument: 'after' },
  ).lean<BookingDoc>();
  if (!updated) throw badRequest('This appointment is already cancelled.');
  const people = await bookingPeople([updated]);
  const teacher = people.get(String(updated.teacherId));
  const student = people.get(String(updated.studentId));
  const when = `${formatShortDate(updated.date)} at ${formatClock(updated.start)}`;
  const other: Types.ObjectId = isTeacher ? updated.studentId : updated.teacherId;
  await notify([other], {
    type: 'bookings',
    title: isTeacher
      ? `${teacher?.name ?? 'Your teacher'} cancelled your office-hours appointment`
      : `${student?.name ?? 'A student'} cancelled their appointment`,
    body: `${when}${reason ? ` · ${reason}` : ''}`,
    link: '/academics/teachers?tab=appointments',
    key: `booking:${updated._id}:cancelled`,
  });
  return toBookingDTO(updated, teacher, student);
}
