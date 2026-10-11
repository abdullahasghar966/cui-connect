/**
 * Room finder: which rooms are free at a moment, until when, and what is on in each room that
 * day. Built from the timetable (after one-off cancellations and moves) and the exam date sheet.
 */
import {
  campusClock,
  EXAM_KIND_LABELS,
  fromMinutes,
  type RoomBookingDTO,
  type RoomFinderDTO,
  toMinutes,
} from '@cui/shared';
import { Exam, type ExamDoc, type UserDoc } from '../models';
import { listRooms } from './rooms';
import { currentTerm } from './terms';
import { classesOn } from './timetable';

export async function roomFinder(
  viewer: UserDoc,
  query: { date?: string; time?: string },
): Promise<RoomFinderDTO> {
  const clock = campusClock();
  const date = query.date ?? clock.date;
  const time = query.time ?? fromMinutes(clock.minutes);
  const term = await currentTerm();
  const [rooms, classes, exams] = await Promise.all([
    listRooms(),
    classesOn(viewer, date),
    Exam.find({ termId: term._id, date }).lean<ExamDoc[]>(),
  ]);

  const byRoom = new Map<string, RoomBookingDTO[]>();
  const add = (roomId: string, booking: RoomBookingDTO) =>
    byRoom.set(roomId, [...(byRoom.get(roomId) ?? []), booking]);
  for (const c of classes) {
    if (!c.room) continue;
    add(c.room.id, {
      kind: 'class',
      start: c.start,
      end: c.end,
      title: `${c.slot.code} ${c.slot.title}`,
      detail: [c.slot.sectionName, c.slot.kind === 'lab' ? 'Lab' : null, c.slot.instructor?.name]
        .filter(Boolean)
        .join(' · '),
    });
  }
  for (const e of exams) {
    for (const roomId of e.roomIds) {
      add(String(roomId), {
        kind: 'exam',
        start: e.start,
        end: e.end,
        title: `${e.code} ${e.title}`,
        detail: EXAM_KIND_LABELS[e.kind],
      });
    }
  }

  const at = toMinutes(time);
  return {
    date,
    time,
    rooms: rooms.map((room) => {
      const bookings = (byRoom.get(room.id) ?? []).sort((a, b) => a.start.localeCompare(b.start));
      const now = bookings.filter((b) => toMinutes(b.start) <= at && at < toMinutes(b.end));
      // A paper takes the room over a class that would normally be there.
      const current = now.find((b) => b.kind === 'exam') ?? now[0] ?? null;
      const next = bookings.find((b) => toMinutes(b.start) > at);
      return { room, current, freeUntil: current ? null : (next?.start ?? null), bookings };
    }),
  };
}
