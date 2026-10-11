/**
 * Exams: the Examination Office's date sheet (Sessional I, Sessional II, terminal papers) and
 * seating plans. A paper is refused when any student would sit two papers at once or a room
 * is double-booked. Publishing tells every student their own papers; seating mixes sections
 * across rooms so classmates don't sit side by side, and tells each student their seat.
 */
import {
  allocateSeats,
  canManageExams,
  EXAM_KIND_LABELS,
  type ExamCheckDTO,
  type ExamDTO,
  type ExamInput,
  type ExamKind,
  type ExamOptionsDTO,
  type ExamRoomDTO,
  eventsOverlap,
  examSchema,
  formatShortDate,
  formatTimeRange,
  type MyExamDTO,
  type SeatingChartDTO,
  seededOrder,
} from '@cui/shared';
import type { Types } from 'mongoose';
import {
  AppError,
  assertAllowed,
  badRequest,
  forbidden,
  isDuplicateKeyError,
  notFound,
  parse,
} from '../lib/errors';
import {
  CourseOffering,
  type CourseOfferingDoc,
  Exam,
  type ExamDoc,
  Room,
  type RoomDoc,
  SeatAssignment,
  type SeatAssignmentDoc,
  User,
  type UserDoc,
} from '../models';
import { recordAudit } from './audit';
import { getOrgLookup, type OrgLookup, sameId, toObjectId, toPolicyUser } from './mappers';
import { notify } from './notifications';
import { currentTerm } from './terms';

const examSeats = (room: Pick<RoomDoc, 'examRows' | 'examCols'>) => room.examRows * room.examCols;

const roomRef = (room: RoomDoc): ExamRoomDTO => ({
  id: String(room._id),
  name: room.name,
  block: room.block,
  seats: examSeats(room),
});

const when = (e: Pick<ExamDoc, 'date' | 'start' | 'end'>) =>
  `${formatShortDate(e.date)}, ${formatTimeRange(e.start, e.end)}`;

const paperName = (e: Pick<ExamDoc, 'code' | 'title' | 'kind'>) =>
  `${e.code} ${e.title} ${EXAM_KIND_LABELS[e.kind]}`;

interface TermExams {
  term: Awaited<ReturnType<typeof currentTerm>>;
  exams: ExamDoc[];
  offerings: Map<string, CourseOfferingDoc>;
  rooms: Map<string, RoomDoc>;
  org: OrgLookup;
}

async function loadTermExams(): Promise<TermExams> {
  const term = await currentTerm();
  const [exams, offerings, rooms, org] = await Promise.all([
    Exam.find({ termId: term._id }).sort({ date: 1, start: 1, code: 1 }).lean<ExamDoc[]>(),
    CourseOffering.find({ termId: term._id }).lean<CourseOfferingDoc[]>(),
    Room.find().lean<RoomDoc[]>(),
    getOrgLookup(),
  ]);
  return {
    term,
    exams,
    offerings: new Map(offerings.map((o) => [String(o._id), o])),
    rooms: new Map(rooms.map((r) => [String(r._id), r])),
    org,
  };
}

function studentsOf(exam: Pick<ExamDoc, 'offeringIds'>, ctx: TermExams): string[] {
  const ids = new Set<string>();
  for (const id of exam.offeringIds) {
    for (const s of ctx.offerings.get(String(id))?.studentIds ?? []) ids.add(String(s));
  }
  return [...ids];
}

async function seatedCounts(examIds: Types.ObjectId[]): Promise<Map<string, number>> {
  const rows = await SeatAssignment.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { examId: { $in: examIds } } },
    { $group: { _id: '$examId', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

function toExamDTO(exam: ExamDoc, ctx: TermExams, seated: number): ExamDTO {
  const rooms = exam.roomIds
    .map((id) => ctx.rooms.get(String(id)))
    .filter((r): r is RoomDoc => !!r)
    .map(roomRef);
  return {
    id: String(exam._id),
    kind: exam.kind,
    code: exam.code,
    title: exam.title,
    sections: exam.offeringIds.map((id) => {
      const offering = ctx.offerings.get(String(id));
      return {
        offeringId: String(id),
        sectionName: offering
          ? (ctx.org.sections.get(String(offering.sectionId))?.name ?? null)
          : null,
        students: offering?.studentIds.length ?? 0,
      };
    }),
    date: exam.date,
    start: exam.start,
    end: exam.end,
    rooms,
    published: exam.published,
    students: studentsOf(exam, ctx).length,
    seats: rooms.reduce((sum, r) => sum + r.seats, 0),
    seated,
  };
}

const manage = (user: UserDoc) => assertAllowed(canManageExams(toPolicyUser(user)));

// ---- The Exam Office ----

export async function listExams(viewer: UserDoc, kind?: ExamKind): Promise<ExamDTO[]> {
  manage(viewer);
  const ctx = await loadTermExams();
  const exams = kind ? ctx.exams.filter((e) => e.kind === kind) : ctx.exams;
  const seated = await seatedCounts(exams.map((e) => e._id));
  return exams.map((e) => toExamDTO(e, ctx, seated.get(String(e._id)) ?? 0));
}

export async function examOptions(viewer: UserDoc): Promise<ExamOptionsDTO> {
  manage(viewer);
  const ctx = await loadTermExams();
  const byCode = new Map<string, ExamOptionsDTO['courses'][number]>();
  for (const offering of ctx.offerings.values()) {
    const entry = byCode.get(offering.code) ?? {
      code: offering.code,
      title: offering.title,
      offerings: [],
    };
    entry.offerings.push({
      offeringId: String(offering._id),
      sectionName: ctx.org.sections.get(String(offering.sectionId))?.name ?? null,
      students: offering.studentIds.length,
    });
    byCode.set(offering.code, entry);
  }
  return {
    courses: [...byCode.values()]
      .map((c) => ({
        ...c,
        offerings: c.offerings.sort((a, b) =>
          (a.sectionName ?? '').localeCompare(b.sectionName ?? ''),
        ),
      }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    rooms: [...ctx.rooms.values()]
      .filter((r) => examSeats(r) > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(roomRef),
  };
}

interface Plan {
  data: ReturnType<typeof examSchema.parse>;
  title: string;
  students: string[];
  rooms: RoomDoc[];
}

function planExam(input: ExamInput, ctx: TermExams): Plan {
  const data = parse(examSchema, input);
  const offerings = data.offeringIds.map((id) => ctx.offerings.get(id));
  if (offerings.some((o) => !o))
    throw notFound('A chosen section does not take a course this term.');
  if (offerings.some((o) => o && o.code !== data.code)) {
    throw badRequest(`Every chosen section must take ${data.code}.`);
  }
  const rooms = data.roomIds.map((id) => ctx.rooms.get(id));
  if (rooms.some((r) => !r)) throw notFound('Room not found.');
  if (rooms.some((r) => r && examSeats(r) === 0)) {
    throw badRequest(
      'That room has no exam seating. Set its exam rows and seats in Admin › Rooms.',
    );
  }
  return {
    data,
    title: offerings[0]?.title ?? data.code,
    students: studentsOf({ offeringIds: data.offeringIds.map(toObjectId) }, ctx),
    rooms: rooms as RoomDoc[],
  };
}

function checkPlan(plan: Plan, ctx: TermExams, examId?: string): ExamCheckDTO {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const { data } = plan;
  const mine = new Set(plan.students);
  for (const other of ctx.exams) {
    if (examId && String(other._id) === examId) continue;
    if (other.kind === data.kind && other.code === data.code) {
      blocking.push(
        `${data.code} already has a ${EXAM_KIND_LABELS[data.kind]} paper (${when(other)}).`,
      );
      continue;
    }
    if (!eventsOverlap(data, other)) continue;
    const shared = studentsOf(other, ctx).filter((id) => mine.has(id)).length;
    if (shared) {
      blocking.push(
        `${shared} student${shared === 1 ? '' : 's'} also sit${shared === 1 ? 's' : ''} ${paperName(other)} at that time (${when(other)}).`,
      );
    }
    const clash = plan.rooms.filter((r) => other.roomIds.some((id) => sameId(id, r._id)));
    for (const room of clash) {
      blocking.push(`${room.name} is already used for ${paperName(other)} (${when(other)}).`);
    }
  }
  const seats = plan.rooms.reduce((sum, r) => sum + examSeats(r), 0);
  if (!plan.rooms.length)
    warnings.push('No room chosen yet: seats can be assigned once rooms are added.');
  else if (seats < plan.students.length) {
    warnings.push(`The rooms seat ${seats}, but ${plan.students.length} students sit this paper.`);
  }
  if (data.date < ctx.term.startsOn || data.date > ctx.term.endsOn) {
    warnings.push(`${formatShortDate(data.date)} is outside ${ctx.term.name}.`);
  }
  return { blocking, warnings };
}

export async function checkExam(
  actor: UserDoc,
  input: ExamInput,
  examId?: string,
): Promise<ExamCheckDTO> {
  manage(actor);
  const ctx = await loadTermExams();
  return checkPlan(planExam(input, ctx), ctx, examId);
}

export async function saveExam(
  actor: UserDoc,
  examId: string | null,
  input: ExamInput,
): Promise<{ exam: ExamDTO; warnings: string[] }> {
  manage(actor);
  const ctx = await loadTermExams();
  const existing = examId ? ctx.exams.find((e) => String(e._id) === examId) : undefined;
  if (examId && !existing) throw notFound('Paper not found.');
  const plan = planExam(input, ctx);
  const { blocking, warnings } = checkPlan(plan, ctx, examId ?? undefined);
  if (blocking.length)
    throw new AppError(409, 'CONFLICT', blocking.join(' '), { blocking, warnings });

  const fields = {
    termId: ctx.term._id,
    kind: plan.data.kind,
    code: plan.data.code,
    title: plan.title,
    offeringIds: plan.data.offeringIds.map(toObjectId),
    date: plan.data.date,
    start: plan.data.start,
    end: plan.data.end,
    roomIds: plan.data.roomIds.map(toObjectId),
  };
  let saved: ExamDoc | null;
  try {
    saved = existing
      ? await Exam.findByIdAndUpdate(
          existing._id,
          { $set: fields },
          { returnDocument: 'after' },
        ).lean<ExamDoc>()
      : (await Exam.create({ ...fields, createdById: actor._id })).toObject<ExamDoc>();
  } catch (err) {
    if (isDuplicateKeyError(err))
      throw new AppError(409, 'CONFLICT', 'That paper is already on the date sheet.');
    throw err;
  }
  if (!saved) throw notFound('Paper not found.');

  let seated = existing ? ((await seatedCounts([existing._id])).get(String(existing._id)) ?? 0) : 0;
  if (existing) {
    const roomsChanged =
      existing.roomIds.map(String).sort().join() !== fields.roomIds.map(String).sort().join();
    const sittersChanged =
      existing.offeringIds.map(String).sort().join() !==
      fields.offeringIds.map(String).sort().join();
    // Seats are only valid for the rooms and students they were made for.
    if (roomsChanged || sittersChanged) {
      await SeatAssignment.deleteMany({ examId: existing._id });
      seated = 0;
    }
    const moved =
      existing.date !== saved.date || existing.start !== saved.start || existing.end !== saved.end;
    if (saved.published && (moved || roomsChanged)) {
      await notify(plan.students, {
        type: 'exams',
        title: `Exam changed: ${paperName(saved)}`,
        body: `Now ${when(saved)}${roomsChanged ? '. Rooms changed; your seat will be announced again.' : '.'}`,
        link: '/academics/exams',
      });
    }
  }
  void recordAudit({
    action: existing ? 'exam.updated' : 'exam.created',
    actor,
    summary: `${actor.name} ${existing ? 'changed' : 'scheduled'} ${paperName(saved)}: ${when(saved)}`,
    targetType: 'exam',
    targetId: saved._id,
  });
  ctx.exams = [...ctx.exams.filter((e) => String(e._id) !== String(saved._id)), saved];
  return { exam: toExamDTO(saved, ctx, seated), warnings };
}

export async function deleteExam(actor: UserDoc, examId: string): Promise<void> {
  manage(actor);
  const ctx = await loadTermExams();
  const exam = ctx.exams.find((e) => String(e._id) === examId);
  if (!exam) throw notFound('Paper not found.');
  await Promise.all([
    Exam.deleteOne({ _id: exam._id }),
    SeatAssignment.deleteMany({ examId: exam._id }),
  ]);
  if (exam.published) {
    await notify(studentsOf(exam, ctx), {
      type: 'exams',
      title: `Exam removed: ${paperName(exam)}`,
      body: `The ${when(exam)} paper is no longer on the date sheet. Watch for a new date.`,
      link: '/academics/exams',
    });
  }
  void recordAudit({
    action: 'exam.deleted',
    actor,
    summary: `${actor.name} removed ${paperName(exam)} from the date sheet`,
    targetType: 'exam',
    targetId: exam._id,
  });
}

/** Publishes a whole date sheet (one kind). Each student hears about their own papers, once. */
export async function publishExams(actor: UserDoc, kind: ExamKind): Promise<{ published: number }> {
  manage(actor);
  const ctx = await loadTermExams();
  const exams = ctx.exams.filter((e) => e.kind === kind);
  if (!exams.length) throw badRequest(`There are no ${EXAM_KIND_LABELS[kind]} papers yet.`);
  await Exam.updateMany(
    { _id: { $in: exams.map((e) => e._id) }, published: false },
    { $set: { published: true, publishedAt: new Date() } },
  );
  const papers = new Map<string, ExamDoc[]>();
  for (const exam of exams) {
    for (const id of studentsOf(exam, ctx)) papers.set(id, [...(papers.get(id) ?? []), exam]);
  }
  const label = EXAM_KIND_LABELS[kind];
  for (const [studentId, list] of papers) {
    const first = [...list].sort(
      (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
    )[0];
    await notify([studentId], {
      type: 'exams',
      title: `The ${label} date sheet is out`,
      body: `You have ${list.length} paper${list.length === 1 ? '' : 's'}${first ? `, starting ${when(first)} with ${first.code} ${first.title}` : ''}.`,
      link: '/academics/exams',
      key: `exams:${ctx.term._id}:${kind}`,
    });
  }
  void recordAudit({
    action: 'exams.published',
    actor,
    summary: `${actor.name} published the ${label} date sheet (${exams.length} papers)`,
    targetType: 'exam',
  });
  return { published: exams.length };
}

/** Seats every student of a paper, mixing sections across its rooms. */
export async function assignSeats(
  actor: UserDoc,
  examId: string,
): Promise<{ seated: number; unseated: number }> {
  manage(actor);
  const ctx = await loadTermExams();
  const exam = ctx.exams.find((e) => String(e._id) === examId);
  if (!exam) throw notFound('Paper not found.');
  const rooms = exam.roomIds
    .map((id) => ctx.rooms.get(String(id)))
    .filter((r): r is RoomDoc => !!r && examSeats(r) > 0);
  if (!rooms.length) throw badRequest('Add a room with exam seating to this paper first.');

  const offeringOf = new Map<string, CourseOfferingDoc>();
  const candidates: { id: string; group: string }[] = [];
  for (const id of exam.offeringIds) {
    const offering = ctx.offerings.get(String(id));
    if (!offering) continue;
    const group = ctx.org.sections.get(String(offering.sectionId))?.name ?? String(offering._id);
    for (const studentId of offering.studentIds.map(String)) {
      if (offeringOf.has(studentId)) continue; // a repeater in two sections sits once
      offeringOf.set(studentId, offering);
      candidates.push({ id: studentId, group });
    }
  }
  // A different order for each paper, so nobody keeps the same seat (sections still alternate).
  const { seats, unseated } = allocateSeats(
    seededOrder(candidates, String(exam._id), (c) => c.id),
    rooms.map((r) => ({ id: String(r._id), rows: r.examRows, cols: r.examCols })),
  );
  await SeatAssignment.deleteMany({ examId: exam._id });
  await SeatAssignment.insertMany(
    seats.map((s) => ({
      examId: exam._id,
      studentId: toObjectId(s.studentId),
      offeringId: offeringOf.get(s.studentId)?._id,
      roomId: toObjectId(s.roomId),
      row: s.row,
      seat: s.seat,
    })),
  );
  if (exam.published) {
    for (const s of seats) {
      const room = ctx.rooms.get(s.roomId);
      await notify([s.studentId], {
        type: 'exams',
        title: `Your seat for ${exam.code} ${EXAM_KIND_LABELS[exam.kind]}`,
        body: `${room?.name ?? 'Room'}, row ${s.row}, seat ${s.seat} · ${when(exam)}.`,
        link: '/academics/exams',
        key: `seat:${exam._id}:${s.roomId}:${s.row}:${s.seat}`,
      });
    }
  }
  void recordAudit({
    action: 'exam.seated',
    actor,
    summary: `${actor.name} assigned seats for ${paperName(exam)}: ${seats.length} seated${unseated ? `, ${unseated} without a seat` : ''}`,
    targetType: 'exam',
    targetId: exam._id,
  });
  return { seated: seats.length, unseated };
}

// ---- Everyone else ----

/** The Exam Office, IT, and the teachers of the paper's sections may print its seating chart. */
export async function seatingChart(viewer: UserDoc, examId: string): Promise<SeatingChartDTO> {
  const ctx = await loadTermExams();
  const exam = ctx.exams.find((e) => String(e._id) === examId);
  if (!exam) throw notFound('Paper not found.');
  const isManager = canManageExams(toPolicyUser(viewer)).allowed;
  const teaches = exam.offeringIds.some((id) =>
    sameId(ctx.offerings.get(String(id))?.instructorId, viewer._id),
  );
  if (!isManager && !(teaches && exam.published)) {
    throw forbidden(
      'Only the Examination Office and the teachers of this paper can see its seating.',
    );
  }
  const assignments = await SeatAssignment.find({ examId: exam._id }).lean<SeatAssignmentDoc[]>();
  const students = await User.find({ _id: { $in: assignments.map((a) => a.studentId) } })
    .select('name regNo sectionId')
    .lean<Pick<UserDoc, '_id' | 'name' | 'regNo' | 'sectionId'>[]>();
  const studentById = new Map(students.map((s) => [String(s._id), s]));
  const roomIds = exam.roomIds.map(String);
  return {
    exam: toExamDTO(exam, ctx, assignments.length),
    rooms: roomIds
      .map((id) => ctx.rooms.get(id))
      .filter((r): r is RoomDoc => !!r)
      .map((room) => ({
        room: roomRef(room),
        rows: room.examRows,
        cols: room.examCols,
        seats: assignments
          .filter((a) => sameId(a.roomId, room._id))
          .sort((a, b) => a.row - b.row || a.seat - b.seat)
          .map((a) => {
            const s = studentById.get(String(a.studentId));
            return {
              row: a.row,
              seat: a.seat,
              student: {
                id: String(a.studentId),
                name: s?.name ?? 'Student',
                regNo: s?.regNo ?? null,
                sectionName: s?.sectionId
                  ? (ctx.org.sections.get(String(s.sectionId))?.name ?? null)
                  : null,
              },
            };
          }),
      })),
    unseated: Math.max(0, studentsOf(exam, ctx).length - assignments.length),
  };
}

/** A student's or teacher's own published papers this term. */
export async function myExams(viewer: UserDoc): Promise<MyExamDTO[]> {
  const id = String(viewer._id);
  if (viewer.role !== 'student' && viewer.role !== 'faculty') return [];
  const ctx = await loadTermExams();
  const mine = (exam: ExamDoc) =>
    exam.offeringIds
      .map((oid) => ctx.offerings.get(String(oid)))
      .filter(
        (o): o is CourseOfferingDoc =>
          !!o &&
          (viewer.role === 'student'
            ? o.studentIds.some((s) => sameId(s, id))
            : sameId(o.instructorId, id)),
      );
  const exams = ctx.exams.filter((e) => e.published && mine(e).length);
  const seats =
    viewer.role === 'student'
      ? await SeatAssignment.find({
          studentId: toObjectId(id),
          examId: { $in: exams.map((e) => e._id) },
        }).lean<SeatAssignmentDoc[]>()
      : [];
  const seatBy = new Map(seats.map((s) => [String(s.examId), s]));
  const ref = (room: RoomDoc | undefined) =>
    room ? { id: String(room._id), name: room.name, block: room.block } : null;
  return exams.map((exam) => {
    const seat = seatBy.get(String(exam._id));
    const seatRoom = seat ? ref(ctx.rooms.get(String(seat.roomId))) : null;
    return {
      id: String(exam._id),
      kind: exam.kind,
      code: exam.code,
      title: exam.title,
      date: exam.date,
      start: exam.start,
      end: exam.end,
      rooms: exam.roomIds
        .map((r) => ref(ctx.rooms.get(String(r))))
        .filter((r): r is NonNullable<typeof r> => !!r),
      seat: seat && seatRoom ? { room: seatRoom, row: seat.row, seat: seat.seat } : null,
      sections:
        viewer.role === 'faculty'
          ? mine(exam).map((o) => ctx.org.sections.get(String(o.sectionId))?.name ?? '')
          : [],
    };
  });
}

/** Rooms booked for a paper can't be deleted. */
export async function roomUsedByExams(roomId: string): Promise<boolean> {
  return !!(await Exam.exists({ roomIds: toObjectId(roomId) }));
}
