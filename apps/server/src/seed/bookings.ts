/** Upcoming office-hour appointments with the demo teacher, so the teacher's Appointments tab isn't empty. */
import { addDays, BOOKING_DAYS_AHEAD, campusClock, officeHourSlots } from '@cui/shared';
import { Booking, CalendarEvent, User, type UserDoc } from '../models';

const PLAN = [
  {
    regNo: 'FA23-BCS-001',
    topic: 'Feedback on the rooms design in my Assignment 1',
    day: 0,
    slot: 0,
  },
  { regNo: 'FA23-BCS-003', topic: 'Catching up on the labs I missed', day: 1, slot: 1 },
];

export async function seedBookings(today = campusClock().date): Promise<number> {
  const [imran, students, holidays] = await Promise.all([
    User.findOne({ email: 'imran.haider@comsats.edu.pk' }).lean<UserDoc>(),
    User.find({ regNo: { $in: PLAN.map((p) => p.regNo) } }).lean<UserDoc[]>(),
    CalendarEvent.find({ kind: 'holiday' }).select('startsOn endsOn').lean(),
  ]);
  if (!imran) return 0;
  // The teacher's next two office-hour days, from tomorrow (Hira's own booking is left for the demo).
  const days: { date: string; slots: { start: string; end: string }[] }[] = [];
  for (let i = 1; i < BOOKING_DAYS_AHEAD && days.length < 2; i++) {
    const date = addDays(today, i);
    if (holidays.some((h) => h.startsOn <= date && date <= h.endsOn)) continue;
    const slots = officeHourSlots(imran.officeHours ?? [], date);
    if (slots.length) days.push({ date, slots });
  }
  const bookings = PLAN.flatMap((p) => {
    const student = students.find((s) => s.regNo === p.regNo);
    const day = days[Math.min(p.day, days.length - 1)];
    const slot = day?.slots[Math.min(p.slot, day.slots.length - 1)];
    return student && day && slot
      ? [
          {
            teacherId: imran._id,
            studentId: student._id,
            date: day.date,
            start: slot.start,
            end: slot.end,
            topic: p.topic,
          },
        ]
      : [];
  });
  // Two plans could land on one slot if the teacher has a single short office hour: keep the first.
  const unique = bookings.filter(
    (b, i) => bookings.findIndex((x) => x.date === b.date && x.start === b.start) === i,
  );
  await Booking.insertMany(unique);
  return unique.length;
}
