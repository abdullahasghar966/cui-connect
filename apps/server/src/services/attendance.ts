/**
 * Attendance. A teacher opens a session for a class; the classroom screen shows a QR code that
 * changes every 10 seconds; students scan it to check in. The teacher sees names appear live and
 * can correct any mark; closing the session marks everyone else absent.
 *
 * The QR code is a signature (HMAC) of the session and the current 10-second window, keyed with
 * a random per-session secret that never leaves the server. So the server needs no timers and
 * survives restarts, and a code stops working about 20 seconds after it was shown (the current
 * and previous windows are accepted). Honest limit: a student can still forward a fresh code
 * to a friend instantly; that friend must be signed in and enrolled, and the teacher can untick
 * anyone who isn't in the room.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  ATTENDANCE_WINDOW_SECONDS,
  type AttendanceCountsDTO,
  type AttendanceQrDTO,
  type AttendanceSessionDetailDTO,
  type AttendanceSessionDTO,
  type AttendanceSheetDTO,
  type AttendanceStatus,
  attendanceSummary,
  attendanceWindow,
  type CheckInInput,
  type CheckInResultDTO,
  campusClock,
  canStudyIn,
  checkInSchema,
  formatShortDate,
  LATE_AFTER_MINUTES,
  type MarkAttendanceInput,
  type MyAttendanceCourseDTO,
  markAttendanceSchema,
  type RosterEntryDTO,
  round,
  type StartAttendanceInput,
  startAttendanceSchema,
  type TeachingCourseDTO,
  weekdayOf,
} from '@cui/shared';
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
  Assessment,
  type AssessmentDoc,
  AttendanceRecord,
  type AttendanceRecordDoc,
  AttendanceSession,
  type AttendanceSessionDoc,
  ClassChange,
  ClassSlot,
  type ClassSlotDoc,
  CourseOffering,
  type CourseOfferingDoc,
  User,
  type UserDoc,
} from '../models';
import { sendAttendanceUpdate } from '../realtime/notifier';
import { recordAudit } from './audit';
import { getOrgLookup, idOf, sameId, toObjectId, toPolicyUser } from './mappers';
import { notify } from './notifications';
import {
  assertCanView,
  courseRef,
  enrolledStudents,
  loadOffering,
  manageDecision,
  type OfferingContext,
  type StudentLite,
  studentRef,
} from './offering-context';
import { getCampusSettings } from './settings';
import { currentTerm } from './terms';
import { offeringFacts } from './timetable';

// ---- Codes ----

const TOKEN_LENGTH = 22;

/** The code shown during one window: HMAC-SHA256(secret, session:window), shortened. */
export function sessionToken(secret: string, sessionId: string, window: number): string {
  return createHmac('sha256', secret)
    .update(`${sessionId}:${window}`)
    .digest('base64url')
    .slice(0, TOKEN_LENGTH);
}

function tokenIsCurrent(secret: string, sessionId: string, token: string, now: Date): boolean {
  const given = Buffer.from(token);
  const window = attendanceWindow(now);
  return [window, window - 1].some((w) => {
    const expected = Buffer.from(sessionToken(secret, sessionId, w));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

// ---- Loading and shaping ----

async function loadSession(sessionId: string, withSecret = false) {
  const query = AttendanceSession.findById(toObjectId(sessionId));
  const session = await (withSecret ? query.select('+secret') : query).lean<AttendanceSessionDoc>();
  if (!session) throw notFound('This attendance session does not exist.');
  return session;
}

function countsFor(
  offering: CourseOfferingDoc,
  records: AttendanceRecordDoc[],
): AttendanceCountsDTO {
  const enrolled = new Set(offering.studentIds.map(String));
  const counts: AttendanceCountsDTO = {
    enrolled: enrolled.size,
    present: 0,
    late: 0,
    absent: 0,
    leave: 0,
    unmarked: 0,
  };
  let marked = 0;
  for (const record of records) {
    if (!enrolled.has(String(record.studentId))) continue;
    counts[record.status]++;
    marked++;
  }
  counts.unmarked = enrolled.size - marked;
  return counts;
}

function toSessionDTO(
  session: AttendanceSessionDoc,
  ctx: OfferingContext,
  records: AttendanceRecordDoc[],
): AttendanceSessionDTO {
  return {
    id: String(session._id),
    course: courseRef(ctx),
    date: session.date,
    start: session.start,
    status: session.status,
    openedAt: session.openedAt.toISOString(),
    closedAt: session.closedAt?.toISOString() ?? null,
    counts: countsFor(ctx.offering, records),
  };
}

function entryFor(student: StudentLite, record: AttendanceRecordDoc | undefined): RosterEntryDTO {
  return {
    student: studentRef(student),
    status: record?.status ?? null,
    method: record?.method ?? null,
    markedAt: record?.markedAt.toISOString() ?? null,
  };
}

/** The instructor and whoever opened the session see check-ins live. */
function audience(session: AttendanceSessionDoc, offering: CourseOfferingDoc): string[] {
  return [String(offering.instructorId), String(session.openedById)];
}

async function broadcast(
  session: AttendanceSessionDoc,
  ctx: OfferingContext,
  entry: RosterEntryDTO | null,
): Promise<void> {
  const records = await AttendanceRecord.find({ sessionId: session._id }).lean<
    AttendanceRecordDoc[]
  >();
  sendAttendanceUpdate(audience(session, ctx.offering), {
    sessionId: String(session._id),
    entry,
    counts: countsFor(ctx.offering, records),
    status: session.status,
  });
}

// ---- Teacher: open, show the code, mark, close ----

export async function sessionDetail(
  viewer: UserDoc,
  sessionId: string,
): Promise<AttendanceSessionDetailDTO> {
  const session = await loadSession(sessionId);
  const ctx = await loadOffering(String(session.offeringId));
  const { canManage: manage } = assertCanView(viewer, ctx);
  const [records, students] = await Promise.all([
    AttendanceRecord.find({ sessionId: session._id }).lean<AttendanceRecordDoc[]>(),
    enrolledStudents(ctx.offering),
  ]);
  const byStudent = new Map(records.map((r) => [String(r.studentId), r]));
  return {
    session: toSessionDTO(session, ctx, records),
    roster: students.map((s) => entryFor(s, byStudent.get(String(s._id)))),
    canManage: manage,
  };
}

export async function startSession(
  actor: UserDoc,
  input: StartAttendanceInput,
): Promise<AttendanceSessionDetailDTO> {
  const data = parse(startAttendanceSchema, input);
  const ctx = await loadOffering(data.offeringId);
  assertAllowed(manageDecision(actor, ctx));
  const term = await currentTerm();
  if (!sameId(ctx.offering.termId, term._id)) {
    throw badRequest(`${ctx.offering.code} isn't taught this term, so attendance is closed.`);
  }
  const today = campusClock().date;
  const date = data.date ?? today;
  if (date > today) throw badRequest("Attendance can't be taken for a class that hasn't happened.");
  if (date < term.startsOn) throw badRequest('That date is before the term started.');

  let slot: ClassSlotDoc | null = null;
  if (data.slotId) {
    slot = await ClassSlot.findOne({
      _id: toObjectId(data.slotId),
      offeringId: ctx.offering._id,
    }).lean<ClassSlotDoc>();
    if (!slot) throw notFound('That class is not on the timetable of this course.');
    if (slot.day !== weekdayOf(date)) {
      throw badRequest(`This class doesn't meet on ${formatShortDate(date)}.`);
    }
  }

  const key = { offeringId: ctx.offering._id, date, slotId: slot?._id ?? null };
  // Only one session of a course is open at a time: close any other (an earlier class).
  const stale = await AttendanceSession.find({
    offeringId: ctx.offering._id,
    status: 'open',
  }).lean<AttendanceSessionDoc[]>();
  for (const other of stale) {
    if (other.date !== date || !sameId(other.slotId, key.slotId)) await close(actor, other, ctx);
  }

  let session = await AttendanceSession.findOneAndUpdate(
    key,
    { $set: { status: 'open', closedAt: null } },
    { returnDocument: 'after' },
  ).lean<AttendanceSessionDoc>();
  if (!session) {
    try {
      session = (
        await AttendanceSession.create({
          ...key,
          termId: term._id,
          start: slot?.start ?? null,
          secret: randomBytes(32).toString('base64url'),
          status: 'open',
          openedById: actor._id,
          openedAt: new Date(),
        })
      ).toObject<AttendanceSessionDoc>();
    } catch (err) {
      // Two clicks at once: the other request created it.
      if (!isDuplicateKeyError(err)) throw err;
      session = await AttendanceSession.findOne(key).lean<AttendanceSessionDoc>();
    }
    void recordAudit({
      action: 'attendance.opened',
      actor,
      summary: `${actor.name} opened attendance for ${ctx.offering.code} · ${ctx.section?.name ?? ''} (${formatShortDate(date)})`,
      targetType: 'course',
      targetId: ctx.offering._id,
    });
  }
  if (!session) throw new Error('Attendance session could not be opened');
  return sessionDetail(actor, String(session._id));
}

export async function sessionQr(
  actor: UserDoc,
  sessionId: string,
  now = new Date(),
): Promise<AttendanceQrDTO> {
  const session = await loadSession(sessionId, true);
  const ctx = await loadOffering(String(session.offeringId));
  assertAllowed(manageDecision(actor, ctx));
  if (session.status !== 'open') throw badRequest('This attendance session is closed.');
  if (session.date !== campusClock(now).date) {
    throw badRequest(
      'The QR code only works on the day of the class. Mark earlier classes by hand.',
    );
  }
  const window = attendanceWindow(now);
  const token = sessionToken(session.secret, String(session._id), window);
  const windowMs = ATTENDANCE_WINDOW_SECONDS * 1000;
  return {
    token,
    path: `/attend/${session._id}?t=${token}`,
    remainingMs: (window + 1) * windowMs - now.getTime(),
    windowSeconds: ATTENDANCE_WINDOW_SECONDS,
  };
}

export async function markStudent(
  actor: UserDoc,
  sessionId: string,
  studentId: string,
  input: MarkAttendanceInput,
): Promise<RosterEntryDTO> {
  const { status } = parse(markAttendanceSchema, input);
  const session = await loadSession(sessionId);
  const ctx = await loadOffering(String(session.offeringId));
  assertAllowed(manageDecision(actor, ctx));
  if (!ctx.offering.studentIds.some((id) => sameId(id, studentId))) {
    throw badRequest('That student is not enrolled in this course.');
  }
  const student = await User.findById(toObjectId(studentId))
    .select('name regNo')
    .lean<StudentLite>();
  if (!student) throw notFound('Student not found.');

  let record: AttendanceRecordDoc | undefined;
  if (status === null) {
    await AttendanceRecord.deleteOne({ sessionId: session._id, studentId: student._id });
  } else {
    record =
      (await AttendanceRecord.findOneAndUpdate(
        { sessionId: session._id, studentId: student._id },
        {
          $set: {
            offeringId: ctx.offering._id,
            status,
            method: 'manual',
            markedById: actor._id,
            markedAt: new Date(),
          },
        },
        { upsert: true, returnDocument: 'after' },
      ).lean<AttendanceRecordDoc>()) ?? undefined;
  }
  const entry = entryFor(student, record);
  await broadcast(session, ctx, entry);
  // Corrections after closing can change who is short.
  if (session.status === 'closed') await warnShortages(ctx, [String(student._id)]);
  return entry;
}

async function close(
  actor: UserDoc,
  session: AttendanceSessionDoc,
  ctx: OfferingContext,
): Promise<void> {
  const marked = new Set(
    (await AttendanceRecord.find({ sessionId: session._id }).select('studentId').lean()).map((r) =>
      String(r.studentId),
    ),
  );
  const missing = ctx.offering.studentIds.filter((id) => !marked.has(String(id)));
  if (missing.length) {
    const now = new Date();
    await AttendanceRecord.insertMany(
      missing.map((studentId) => ({
        sessionId: session._id,
        offeringId: ctx.offering._id,
        studentId,
        status: 'absent',
        method: 'auto',
        markedById: null,
        markedAt: now,
      })),
      { ordered: false },
    ).catch((err) => {
      if (!isDuplicateKeyError(err)) throw err;
    });
  }
  const closed = await AttendanceSession.findByIdAndUpdate(
    session._id,
    { $set: { status: 'closed', closedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean<AttendanceSessionDoc>();
  if (!closed) return;
  const records = await AttendanceRecord.find({ sessionId: session._id }).lean<
    AttendanceRecordDoc[]
  >();
  const counts = countsFor(ctx.offering, records);
  void recordAudit({
    action: 'attendance.closed',
    actor,
    summary: `${actor.name} closed attendance for ${ctx.offering.code} · ${ctx.section?.name ?? ''} (${formatShortDate(session.date)}): ${counts.present + counts.late} of ${counts.enrolled} attended`,
    targetType: 'course',
    targetId: ctx.offering._id,
  });
  await broadcast(closed, ctx, null);
  await warnShortages(ctx);
}

export async function closeSession(
  actor: UserDoc,
  sessionId: string,
): Promise<AttendanceSessionDetailDTO> {
  const session = await loadSession(sessionId);
  const ctx = await loadOffering(String(session.offeringId));
  assertAllowed(manageDecision(actor, ctx));
  if (session.status === 'open') await close(actor, session, ctx);
  return sessionDetail(actor, sessionId);
}

/**
 * Tells students when they drop near or below the minimum: once per course for the warning and
 * once for the shortage (the notification key stops repeats).
 */
async function warnShortages(ctx: OfferingContext, onlyStudents?: string[]): Promise<void> {
  const { minAttendance } = await getCampusSettings();
  const records = await AttendanceRecord.find({ offeringId: ctx.offering._id })
    .select('studentId status')
    .lean<Pick<AttendanceRecordDoc, 'studentId' | 'status'>[]>();
  const byStudent = new Map<string, AttendanceStatus[]>();
  for (const r of records) {
    const id = String(r.studentId);
    if (onlyStudents && !onlyStudents.includes(id)) continue;
    byStudent.set(id, [...(byStudent.get(id) ?? []), r.status]);
  }
  const course = `${ctx.offering.title} · ${ctx.section?.name ?? ''}`;
  for (const [studentId, statuses] of byStudent) {
    if (!ctx.offering.studentIds.some((id) => sameId(id, studentId))) continue;
    const summary = attendanceSummary(statuses, minAttendance);
    if (summary.state === 'ok' || summary.percent === null) continue;
    const short = summary.state === 'short';
    await notify([studentId], {
      type: 'attendance',
      title: short
        ? `Attendance shortage: ${course} is at ${summary.percent}%`
        : `Attendance warning: ${course} is at ${summary.percent}%`,
      body: short
        ? `You need ${minAttendance}% to sit the terminal exam. Attend every remaining class and talk to your teacher.`
        : `You are close to the ${minAttendance}% minimum. Missing more classes puts the terminal exam at risk.`,
      link: '/academics/attendance',
      key: `attendance:${ctx.offering._id}:${summary.state}`,
    });
  }
}

// ---- Student: check in ----

export async function checkIn(
  user: UserDoc,
  input: CheckInInput,
  now = new Date(),
): Promise<CheckInResultDTO> {
  const data = parse(checkInSchema, input);
  const session = await loadSession(data.sessionId, true);
  const ctx = await loadOffering(String(session.offeringId));
  assertAllowed(canStudyIn(toPolicyUser(user), offeringFacts(ctx.offering, ctx.section)));
  if (session.status !== 'open' || session.date !== campusClock(now).date) {
    throw new AppError(
      409,
      'CONFLICT',
      'Attendance for this class is closed. If you were there, ask your teacher to mark you.',
    );
  }
  if (!tokenIsCurrent(session.secret, String(session._id), data.token, now)) {
    throw badRequest('This code has expired. Scan the code on the screen again.');
  }

  const result = (status: AttendanceStatus, already: boolean): CheckInResultDTO => ({
    status,
    already,
    course: courseRef(ctx),
    date: session.date,
  });
  const existing = await AttendanceRecord.findOne({
    sessionId: session._id,
    studentId: user._id,
  }).lean<AttendanceRecordDoc>();
  if (existing?.status === 'absent' && existing.method === 'manual') {
    throw forbidden(
      'Your teacher marked you absent for this class. Speak to them if that is a mistake.',
    );
  }
  if (existing && existing.status !== 'absent') return result(existing.status, true);

  const late = now.getTime() - session.openedAt.getTime() > LATE_AFTER_MINUTES * 60_000;
  const status: AttendanceStatus = late ? 'late' : 'present';
  const record = await AttendanceRecord.findOneAndUpdate(
    { sessionId: session._id, studentId: user._id },
    {
      $set: {
        offeringId: ctx.offering._id,
        status,
        method: 'qr',
        markedById: user._id,
        markedAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' },
  ).lean<AttendanceRecordDoc>();
  await broadcast(
    session,
    ctx,
    entryFor({ _id: user._id, name: user.name, regNo: user.regNo }, record ?? undefined),
  );
  return result(status, false);
}

// ---- Summaries ----

export async function myAttendance(user: UserDoc): Promise<MyAttendanceCourseDTO[]> {
  if (user.role !== 'student') return [];
  const term = await currentTerm();
  const [offerings, org, { minAttendance }] = await Promise.all([
    CourseOffering.find({ termId: term._id, studentIds: user._id })
      .sort({ code: 1 })
      .lean<CourseOfferingDoc[]>(),
    getOrgLookup(),
    getCampusSettings(),
  ]);
  const records = await AttendanceRecord.find({
    studentId: user._id,
    offeringId: { $in: offerings.map((o) => o._id) },
  }).lean<AttendanceRecordDoc[]>();
  const sessions = await AttendanceSession.find({ _id: { $in: records.map((r) => r.sessionId) } })
    .select('date start')
    .lean<Pick<AttendanceSessionDoc, '_id' | 'date' | 'start'>[]>();
  const sessionById = new Map(sessions.map((s) => [String(s._id), s]));
  return offerings.map((offering) => {
    const mine = records
      .filter((r) => sameId(r.offeringId, offering._id))
      .map((r) => ({ record: r, session: sessionById.get(String(r.sessionId)) }))
      .filter((x) => x.session)
      .sort(
        (a, b) =>
          (a.session?.date ?? '').localeCompare(b.session?.date ?? '') ||
          (a.session?.start ?? '').localeCompare(b.session?.start ?? ''),
      );
    return {
      course: courseRef({ offering, section: org.sections.get(String(offering.sectionId)), org }),
      summary: attendanceSummary(
        mine.map((x) => x.record.status),
        minAttendance,
      ),
      minimum: minAttendance,
      sessions: mine.map((x) => ({ date: x.session?.date ?? '', status: x.record.status })),
    };
  });
}

export async function attendanceSheet(
  viewer: UserDoc,
  offeringId: string,
): Promise<AttendanceSheetDTO> {
  const ctx = await loadOffering(offeringId);
  assertCanView(viewer, ctx);
  const [sessions, records, students, { minAttendance }] = await Promise.all([
    AttendanceSession.find({ offeringId: ctx.offering._id })
      .sort({ date: 1, start: 1 })
      .lean<AttendanceSessionDoc[]>(),
    AttendanceRecord.find({ offeringId: ctx.offering._id }).lean<AttendanceRecordDoc[]>(),
    enrolledStudents(ctx.offering),
    getCampusSettings(),
  ]);
  const recordsBySession = new Map<string, AttendanceRecordDoc[]>();
  const status = new Map<string, AttendanceStatus>();
  for (const r of records) {
    const sid = String(r.sessionId);
    recordsBySession.set(sid, [...(recordsBySession.get(sid) ?? []), r]);
    status.set(`${sid}:${r.studentId}`, r.status);
  }
  return {
    course: courseRef(ctx),
    minimum: minAttendance,
    sessions: sessions.map((s) => toSessionDTO(s, ctx, recordsBySession.get(String(s._id)) ?? [])),
    students: students.map((student) => {
      const statuses = sessions.map((s) => status.get(`${s._id}:${student._id}`) ?? null);
      return {
        student: studentRef(student),
        statuses,
        summary: attendanceSummary(
          statuses.filter((x): x is AttendanceStatus => x !== null),
          minAttendance,
        ),
      };
    }),
  };
}

/** The courses a teacher runs this term, with attendance at a glance and today's classes. */
export async function teachingCourses(viewer: UserDoc): Promise<TeachingCourseDTO[]> {
  if (viewer.role !== 'faculty') return [];
  const term = await currentTerm();
  const clock = campusClock();
  const [offerings, org, { minAttendance }] = await Promise.all([
    CourseOffering.find({ termId: term._id, instructorId: viewer._id })
      .sort({ code: 1 })
      .lean<CourseOfferingDoc[]>(),
    getOrgLookup(),
    getCampusSettings(),
  ]);
  const ids = offerings.map((o) => o._id);
  const [sessions, records, slots, changes, assessments] = await Promise.all([
    AttendanceSession.find({ offeringId: { $in: ids } })
      .select('offeringId status')
      .lean<Pick<AttendanceSessionDoc, '_id' | 'offeringId' | 'status'>[]>(),
    AttendanceRecord.find({ offeringId: { $in: ids } })
      .select('offeringId studentId status')
      .lean<Pick<AttendanceRecordDoc, 'offeringId' | 'studentId' | 'status'>[]>(),
    ClassSlot.find({ offeringId: { $in: ids }, day: clock.weekday }).lean<ClassSlotDoc[]>(),
    ClassChange.find({ offeringId: { $in: ids }, date: clock.date })
      .select('slotId')
      .lean(),
    Assessment.find({ offeringId: { $in: ids } })
      .select('offeringId published')
      .lean<Pick<AssessmentDoc, 'offeringId' | 'published'>[]>(),
  ]);
  const changedToday = new Set(changes.map((c) => String(c.slotId)));
  return offerings.map((offering) => {
    const own = sessions.filter((s) => sameId(s.offeringId, offering._id));
    const byStudent = new Map<string, AttendanceStatus[]>();
    for (const r of records) {
      if (!sameId(r.offeringId, offering._id)) continue;
      const id = String(r.studentId);
      byStudent.set(id, [...(byStudent.get(id) ?? []), r.status]);
    }
    const summaries = offering.studentIds.map((id) =>
      attendanceSummary(byStudent.get(String(id)) ?? [], minAttendance),
    );
    const percents = summaries.map((s) => s.percent).filter((p): p is number => p !== null);
    return {
      course: courseRef({ offering, section: org.sections.get(String(offering.sectionId)), org }),
      enrolled: offering.studentIds.length,
      sessionsHeld: own.length,
      averagePercent: percents.length
        ? round(percents.reduce((a, b) => a + b, 0) / percents.length, 1)
        : null,
      short: summaries.filter((s) => s.state === 'short').length,
      openSessionId: idOf(own.find((s) => s.status === 'open')?._id),
      today: slots
        .filter((s) => sameId(s.offeringId, offering._id) && !changedToday.has(String(s._id)))
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((s) => ({ slotId: String(s._id), start: s.start, end: s.end })),
      marks: {
        assessments: assessments.filter((a) => sameId(a.offeringId, offering._id)).length,
        published: assessments.filter((a) => sameId(a.offeringId, offering._id) && a.published)
          .length,
        finalized: !!offering.finalizedAt,
      },
    };
  });
}
