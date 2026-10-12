/**
 * Course registration for the coming term.
 *
 * The department office (or IT) offers course sections for next term, usually by filling them
 * from the degree plans and then choosing teachers. While registration is open (the academic
 * calendar's dates, or opened by hand by the Director's Office), students build a plan; the same
 * checks as in the browser (`checkRegistration`: prerequisites, passed courses, clashes, seats,
 * credit limit) decide whether it can be sent. Sending holds a seat in each section (atomically,
 * never above capacity, and every open page sees the counts move); the batch advisor approves the
 * plan or returns it with a note, which frees the seats. An approved plan is the student's
 * enrolment for next term.
 */
import {
  campusClock,
  canHandleRequest,
  canManageCalendar,
  canManageTimetable,
  canSubmit,
  checkRegistration,
  defaultTermDates,
  describeSlots,
  formatShortDate,
  latestAttempts,
  nextTermCode,
  OFFICE_LABELS,
  type OfferLike,
  type OfferSlot,
  type OfferStudentDTO,
  type PlanOffersInput,
  planOffersSchema,
  type RegistrationApproveInput,
  type RegistrationDTO,
  type RegistrationHomeDTO,
  type RegistrationOfferDTO,
  type RegistrationOfferInput,
  type RegistrationPlanInput,
  type RegistrationReturnInput,
  type RegistrationWindowDTO,
  type RegistrationWindowInput,
  registrationApproveSchema,
  registrationOfferSchema,
  registrationPlanSchema,
  registrationReturnSchema,
  registrationWindowSchema,
  type StudentRecordLike,
  semesterNumber,
  slotLabel,
  type TermRefDTO,
  termName,
  timesOverlap,
} from '@cui/shared';
import type { Types } from 'mongoose';
import {
  assertAllowed,
  badRequest,
  conflict,
  forbidden,
  isDuplicateKeyError,
  notFound,
  parse,
} from '../lib/errors';
import {
  CalendarEvent,
  CampusSettings,
  CatalogCourse,
  type CatalogCourseDoc,
  CourseOffering,
  Program,
  Registration,
  type RegistrationDoc,
  RegistrationOffer,
  type RegistrationOfferDoc,
  Result,
  Section,
  type SectionDoc,
  Term,
  type TermDoc,
  User,
  type UserDoc,
} from '../models';
import { broadcastRegistrationSeats } from '../realtime/notifier';
import { recordAudit } from './audit';
import { getOrgLookup, idOf, sameId, toObjectId, toPolicyUser } from './mappers';
import { notify } from './notifications';
import { handlerIds, routeFor } from './requests';
import { getCampusSettings, invalidateCampusSettings } from './settings';
import { currentTerm } from './terms';

/** Seats a new offer gets when the office doesn't say (a usual classroom). */
export const DEFAULT_CAPACITY = 50;

const LECTURE_TIMES: [string, string][] = [
  ['08:30', '10:00'],
  ['10:00', '11:30'],
  ['11:30', '13:00'],
  ['14:00', '15:30'],
];
const LAB_TIMES: [string, string][] = [
  ['08:30', '11:30'],
  ['11:30', '14:30'],
  ['14:00', '17:00'],
];
const TEACHING_DAYS = [1, 2, 3, 4, 5];

const link = (id: Types.ObjectId | string) => `/academics/registration/${id}`;

// ---- The coming term and the window ----

/** The term after the current one (it may not exist yet). */
async function nextTerm(): Promise<{ ref: TermRefDTO; doc: TermDoc | null }> {
  const code = nextTermCode((await currentTerm()).code);
  const doc = await Term.findOne({ code }).lean<TermDoc>();
  return {
    ref: { id: doc ? String(doc._id) : null, code, name: doc?.name ?? termName(code) },
    doc,
  };
}

/** Creates next term (not current) the first time something is offered for it. */
export async function ensureNextTerm(): Promise<TermDoc> {
  const { ref, doc } = await nextTerm();
  if (doc) return doc;
  try {
    return (
      await Term.create({
        code: ref.code,
        name: ref.name,
        ...defaultTermDates(ref.code),
        current: false,
      })
    ).toObject<TermDoc>();
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    const existing = await Term.findOne({ code: ref.code }).lean<TermDoc>();
    if (!existing) throw err;
    return existing;
  }
}

async function windowFor(viewer: UserDoc): Promise<RegistrationWindowDTO> {
  const [{ registrationMode: mode }, events] = await Promise.all([
    getCampusSettings(),
    CalendarEvent.find({ kind: 'registration' }).sort({ startsOn: 1 }).lean(),
  ]);
  const today = campusClock().date;
  const now = events.find((e) => e.startsOn <= today && today <= e.endsOn);
  const shown = now ?? events.find((e) => e.startsOn > today) ?? null;
  return {
    open: mode === 'open' || (mode === 'calendar' && !!now),
    mode,
    startsOn: shown?.startsOn ?? null,
    endsOn: shown?.endsOn ?? null,
    canChange: canManageCalendar(toPolicyUser(viewer)).allowed,
  };
}

async function assertOpen(viewer: UserDoc): Promise<void> {
  const window = await windowFor(viewer);
  if (!window.open) {
    // Closed by hand stays closed whatever the calendar says.
    throw badRequest(
      window.mode === 'calendar' && window.startsOn && window.startsOn > campusClock().date
        ? `Registration opens on ${formatShortDate(window.startsOn)}.`
        : 'Registration is closed.',
    );
  }
}

/** The Director's Office (or IT) opens or closes registration by hand, or follows the calendar. */
export async function setRegistrationWindow(
  actor: UserDoc,
  input: RegistrationWindowInput,
): Promise<RegistrationWindowDTO> {
  assertAllowed(canManageCalendar(toPolicyUser(actor)));
  const { mode } = parse(registrationWindowSchema, input);
  const before = await windowFor(actor);
  await CampusSettings.updateOne(
    { _id: 'campus' },
    { $set: { registrationMode: mode } },
    { upsert: true },
  );
  invalidateCampusSettings();
  const after = await windowFor(actor);
  const { ref } = await nextTerm();
  void recordAudit({
    action: 'registration.window',
    actor,
    summary: `${actor.name} set course registration to ${mode === 'calendar' ? 'follow the academic calendar' : mode === 'open' ? 'open' : 'closed'}`,
    targetType: 'settings',
  });
  if (after.open && !before.open) {
    const students = await User.find({ role: 'student', active: true }).distinct('_id');
    await notify(students, {
      type: 'registration',
      title: `Course registration for ${ref.name} is open`,
      body: 'Pick your courses and send the plan to your batch advisor.',
      link: '/academics/registration',
      key: `registration:open:${ref.code}:${campusClock().date}`,
    });
  }
  return after;
}

// ---- Offers ----

async function catalogFor(codes: string[]) {
  const docs = await CatalogCourse.find({ code: { $in: codes } })
    .select('code title credits labCredits prerequisites')
    .lean<
      Pick<CatalogCourseDoc, 'code' | 'title' | 'credits' | 'labCredits' | 'prerequisites'>[]
    >();
  return new Map(docs.map((c) => [c.code, c]));
}

async function offerDTOs(
  viewer: UserDoc,
  docs: RegistrationOfferDoc[],
): Promise<RegistrationOfferDTO[]> {
  const [org, catalog, teachers] = await Promise.all([
    getOrgLookup(),
    catalogFor([...new Set(docs.map((d) => d.code))]),
    User.find({ _id: { $in: docs.flatMap((d) => (d.instructorId ? [d.instructorId] : [])) } })
      .select('name')
      .lean<Pick<UserDoc, '_id' | 'name'>[]>(),
  ]);
  const teacherName = new Map(teachers.map((t) => [String(t._id), t.name]));
  const policyUser = toPolicyUser(viewer);
  return docs.map((doc) => ({
    id: String(doc._id),
    code: doc.code,
    title: doc.title,
    credits: doc.credits,
    labCredits: doc.labCredits,
    prerequisites: catalog.get(doc.code)?.prerequisites ?? [],
    section: {
      id: String(doc.sectionId),
      name: org.sections.get(String(doc.sectionId))?.name ?? 'Section',
    },
    departmentCode: org.departments.get(String(doc.departmentId))?.code ?? null,
    instructor: doc.instructorId
      ? {
          id: String(doc.instructorId),
          name: teacherName.get(String(doc.instructorId)) ?? 'Teacher',
        }
      : null,
    capacity: doc.capacity,
    seatsTaken: doc.seatsTaken,
    seatsLeft: Math.max(0, doc.capacity - doc.seatsTaken),
    slots: doc.slots.map((s) => ({ day: s.day, start: s.start, end: s.end })),
    canManage: canManageTimetable(policyUser, String(doc.departmentId)).allowed,
  }));
}

const overlaps = (a: readonly OfferSlot[], b: readonly OfferSlot[]) =>
  a.find((sa) =>
    b.some((sb) => sb.day === sa.day && timesOverlap(sa.start, sa.end, sb.start, sb.end)),
  );

/** Why an offer can't be at these times: its section or its teacher already has a class then. */
function offerClash(
  candidate: { id?: string; sectionId: string; instructorId: string | null; slots: OfferSlot[] },
  others: RegistrationOfferDoc[],
  sectionName: string,
): string | null {
  for (const other of others) {
    if (candidate.id && String(other._id) === candidate.id) continue;
    const sameSection = String(other.sectionId) === candidate.sectionId;
    const sameTeacher =
      !!candidate.instructorId && String(other.instructorId) === candidate.instructorId;
    if (!sameSection && !sameTeacher) continue;
    const clash = overlaps(candidate.slots, other.slots);
    if (!clash) continue;
    return sameSection
      ? `${sectionName} already has ${other.code} on ${slotLabel(clash)}.`
      : `That teacher already teaches ${other.code} on ${slotLabel(clash)}.`;
  }
  return null;
}

/**
 * A clash-free week for a section's courses: two lectures on different days, plus a three-hour
 * lab for courses with lab credits; a project (3 lab credits) meets once a week.
 */
export function placeWeek(
  courses: { code: string; labCredits: number }[],
  busy: OfferSlot[] = [],
): Map<string, OfferSlot[]> {
  const taken = [...busy];
  const result = new Map<string, OfferSlot[]>();
  for (const [index, course] of courses.entries()) {
    const project = course.labCredits >= 3;
    const kinds: ('lecture' | 'lab')[] = project ? ['lecture'] : ['lecture', 'lecture'];
    if (!project && course.labCredits > 0) kinds.push('lab');
    const days = TEACHING_DAYS.map(
      (_, i) => TEACHING_DAYS[(i + index * 2) % TEACHING_DAYS.length] as number,
    );
    const used = new Set<number>();
    const slots: OfferSlot[] = [];
    for (const kind of kinds) {
      let placed: OfferSlot | null = null;
      for (const day of days) {
        if (placed || used.has(day)) continue;
        for (const [start, end] of kind === 'lab' ? LAB_TIMES : LECTURE_TIMES) {
          const slot = { day, start, end };
          if (overlaps([slot], taken)) continue;
          placed = slot;
          break;
        }
      }
      if (!placed) continue;
      used.add(placed.day);
      taken.push(placed);
      slots.push(placed);
    }
    result.set(course.code, slots);
  }
  return result;
}

async function loadSection(sectionId: string): Promise<SectionDoc> {
  const section = await Section.findById(toObjectId(sectionId)).lean<SectionDoc>();
  if (!section) throw notFound('Section not found.');
  return section;
}

export async function saveOffer(
  actor: UserDoc,
  input: RegistrationOfferInput,
  offerId?: string,
): Promise<RegistrationOfferDTO> {
  const data = parse(registrationOfferSchema, input);
  const section = await loadSection(data.sectionId);
  assertAllowed(canManageTimetable(toPolicyUser(actor), String(section.departmentId)));
  const course = (await catalogFor([data.code])).get(data.code);
  if (!course) throw badRequest(`${data.code} isn't in the course catalog. Add it there first.`);
  if (data.instructorId) {
    const teacher = await User.exists({
      _id: toObjectId(data.instructorId),
      role: 'faculty',
      active: true,
    });
    if (!teacher) throw badRequest('Choose a teacher from the faculty.');
  }
  const term = await ensureNextTerm();
  const existing = offerId
    ? await RegistrationOffer.findById(toObjectId(offerId)).lean<RegistrationOfferDoc>()
    : null;
  if (offerId && !existing) throw notFound('Offer not found.');
  if (existing && data.capacity < existing.seatsTaken) {
    throw badRequest(
      `${existing.seatsTaken} students already hold seats; capacity can't be lower.`,
    );
  }
  const others = await RegistrationOffer.find({ termId: term._id }).lean<RegistrationOfferDoc[]>();
  const clash = offerClash(
    {
      id: offerId,
      sectionId: String(section._id),
      instructorId: data.instructorId ?? null,
      slots: data.slots,
    },
    others,
    section.name,
  );
  if (clash) throw conflict(clash);

  const fields = {
    termId: term._id,
    code: data.code,
    title: course.title,
    credits: course.credits,
    labCredits: course.labCredits,
    sectionId: section._id,
    departmentId: section.departmentId,
    instructorId: data.instructorId ? toObjectId(data.instructorId) : null,
    capacity: data.capacity,
    slots: data.slots,
  };
  let saved: RegistrationOfferDoc | null;
  try {
    saved = existing
      ? await RegistrationOffer.findByIdAndUpdate(
          existing._id,
          { $set: fields },
          { returnDocument: 'after' },
        ).lean<RegistrationOfferDoc>()
      : (
          await RegistrationOffer.create({ ...fields, createdById: actor._id })
        ).toObject<RegistrationOfferDoc>();
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw conflict(`${data.code} is already offered to ${section.name} next term.`);
    }
    throw err;
  }
  if (!saved) throw notFound('Offer not found.');

  // Students with this course in a sent or approved plan hear about new times.
  if (existing && describeSlots(existing.slots) !== describeSlots(saved.slots)) {
    const holders = await Registration.find({ heldOfferIds: saved._id }).distinct('studentId');
    await notify(holders, {
      type: 'registration',
      title: `New times for ${saved.code} (${section.name}) next term`,
      body: `${describeSlots(saved.slots)}. Check your plan for clashes.`,
      link: '/academics/registration',
    });
  }
  void recordAudit({
    action: existing ? 'registration.offer.updated' : 'registration.offer.created',
    actor,
    summary: `${actor.name} ${existing ? 'updated' : 'offered'} ${saved.code} for ${section.name} in ${term.name}`,
    targetType: 'offer',
    targetId: saved._id,
  });
  const [dto] = await offerDTOs(actor, [saved]);
  if (!dto) throw notFound('Offer not found.');
  return dto;
}

export async function deleteOffer(actor: UserDoc, offerId: string): Promise<{ ok: true }> {
  const offer = await RegistrationOffer.findById(toObjectId(offerId)).lean<RegistrationOfferDoc>();
  if (!offer) throw notFound('Offer not found.');
  assertAllowed(canManageTimetable(toPolicyUser(actor), String(offer.departmentId)));
  const { deletedCount } = await RegistrationOffer.deleteOne({ _id: offer._id, seatsTaken: 0 });
  if (!deletedCount) {
    throw conflict(
      'Students have sent plans with this course. Ask their advisors to return them first.',
    );
  }
  // Drop it from plans that haven't been sent.
  await Registration.updateMany({ offerIds: offer._id }, { $pull: { offerIds: offer._id } });
  void recordAudit({
    action: 'registration.offer.deleted',
    actor,
    summary: `${actor.name} removed the ${offer.code} offer for next term`,
    targetType: 'offer',
    targetId: offer._id,
  });
  return { ok: true };
}

/**
 * Offers each section's next-semester courses from its degree plan (skipping any already
 * offered), at clash-free times. Teachers are left to choose. Returns how many were created.
 */
export async function createPlannedOffers(
  sections: SectionDoc[],
  term: TermDoc,
  createdById: Types.ObjectId | null = null,
): Promise<number> {
  const programs = new Map(
    (await Program.find({ code: { $in: sections.map((s) => s.program) } }).lean()).map((p) => [
      p.code,
      p,
    ]),
  );
  const existing = await RegistrationOffer.find({ termId: term._id }).lean<
    RegistrationOfferDoc[]
  >();
  let created = 0;
  for (const section of sections) {
    const semester = semesterNumber(section.intake, term.code);
    const codes =
      programs.get(section.program)?.plan.find((p) => p.semester === semester)?.courses ?? [];
    const own = existing.filter((o) => sameId(o.sectionId, section._id));
    const missing = codes.filter((code) => !own.some((o) => o.code === code));
    if (!missing.length) continue;
    const catalog = await catalogFor(missing);
    const courses = missing.flatMap((code) => {
      const c = catalog.get(code);
      return c ? [c] : [];
    });
    const week = placeWeek(
      courses,
      own.flatMap((o) => o.slots),
    );
    const docs = courses.map((c) => ({
      termId: term._id,
      code: c.code,
      title: c.title,
      credits: c.credits,
      labCredits: c.labCredits,
      sectionId: section._id,
      departmentId: section.departmentId,
      instructorId: null,
      capacity: DEFAULT_CAPACITY,
      seatsTaken: 0,
      slots: week.get(c.code) ?? [],
      createdById,
    }));
    await RegistrationOffer.insertMany(docs);
    created += docs.length;
  }
  return created;
}

export async function planOffers(
  actor: UserDoc,
  input: PlanOffersInput,
): Promise<{ created: number }> {
  const data = parse(planOffersSchema, input);
  const sections = data.sectionId
    ? [await loadSection(data.sectionId)]
    : await Section.find({ departmentId: toObjectId(String(data.departmentId)) }).lean<
        SectionDoc[]
      >();
  for (const section of sections) {
    assertAllowed(canManageTimetable(toPolicyUser(actor), String(section.departmentId)));
  }
  const term = await ensureNextTerm();
  const created = await createPlannedOffers(sections, term, actor._id);
  if (created) {
    void recordAudit({
      action: 'registration.offer.planned',
      actor,
      summary: `${actor.name} offered ${created} course${created === 1 ? '' : 's'} for ${term.name} from the degree plans`,
      targetType: 'term',
      targetId: term._id,
    });
  }
  return { created };
}

/** Who holds a seat in an offer: its department office, IT and its teacher may look. */
export async function offerStudents(viewer: UserDoc, offerId: string): Promise<OfferStudentDTO[]> {
  const offer = await RegistrationOffer.findById(toObjectId(offerId)).lean<RegistrationOfferDoc>();
  if (!offer) throw notFound('Offer not found.');
  if (
    !sameId(offer.instructorId, viewer._id) &&
    !canManageTimetable(toPolicyUser(viewer), String(offer.departmentId)).allowed
  ) {
    throw forbidden('Only the department office and the teacher can see who registered.');
  }
  const regs = await Registration.find({ heldOfferIds: offer._id })
    .select('studentId status')
    .lean<Pick<RegistrationDoc, 'studentId' | 'status'>[]>();
  const [students, org] = await Promise.all([
    User.find({ _id: { $in: regs.map((r) => r.studentId) } })
      .select('name regNo sectionId')
      .sort({ regNo: 1 })
      .lean<Pick<UserDoc, '_id' | 'name' | 'regNo' | 'sectionId'>[]>(),
    getOrgLookup(),
  ]);
  const status = new Map(regs.map((r) => [String(r.studentId), r.status]));
  return students.map((s) => ({
    id: String(s._id),
    name: s.name,
    regNo: s.regNo,
    sectionName: s.sectionId ? (org.sections.get(String(s.sectionId))?.name ?? null) : null,
    status: status.get(String(s._id)) === 'approved' ? 'approved' : 'submitted',
  }));
}

// ---- Students' plans ----

/** Courses passed (latest attempt) and courses being taken this term. */
export async function studentRecord(studentId: Types.ObjectId): Promise<StudentRecordLike> {
  const [results, current] = await Promise.all([
    Result.find({ studentId }).select('code termId credits points').lean(),
    currentTerm(),
  ]);
  const terms = new Map(
    (
      await Term.find({ _id: { $in: [...new Set(results.map((r) => String(r.termId)))] } })
        .select('code')
        .lean()
    ).map((t) => [String(t._id), t.code]),
  );
  const latest = latestAttempts(
    results.map((r) => ({
      code: r.code,
      term: terms.get(String(r.termId)) ?? 'FA00',
      credits: r.credits,
      points: r.points,
    })),
  );
  const passed = latest.filter((a) => a.points > 0).map((a) => a.code);
  const taking: string[] = await CourseOffering.find({
    termId: current._id,
    studentIds: studentId,
  }).distinct('code');
  // A course finalised this term already has its result.
  const finalisedNow = new Set(
    results.filter((r) => sameId(r.termId, current._id)).map((r) => r.code),
  );
  return {
    passed: passed.sort(),
    inProgress: taking.filter((c) => !finalisedNow.has(c)).sort(),
  };
}

const toOfferLike = (o: RegistrationOfferDTO): OfferLike => ({
  id: o.id,
  code: o.code,
  title: o.title,
  sectionName: o.section.name,
  credits: o.credits,
  prerequisites: o.prerequisites,
  slots: o.slots,
  seatsLeft: o.seatsLeft,
});

type Route = RegistrationDoc['route'];

const handles = (viewer: UserDoc, route: Route) =>
  canHandleRequest(toPolicyUser(viewer), {
    office: route.office,
    departmentId: idOf(route.departmentId),
    userId: idOf(route.userId),
  }).allowed;

async function registrationDTOs(
  viewer: UserDoc,
  docs: RegistrationDoc[],
): Promise<RegistrationDTO[]> {
  if (!docs.length) return [];
  const offerIds = [...new Set(docs.flatMap((d) => d.offerIds.map(String)))];
  const [offerDocs, people, terms, org] = await Promise.all([
    RegistrationOffer.find({ _id: { $in: offerIds.map((id) => toObjectId(id)) } }).lean<
      RegistrationOfferDoc[]
    >(),
    User.find({
      _id: {
        $in: docs.flatMap((d) => [d.studentId, ...(d.route.userId ? [d.route.userId] : [])]),
      },
    })
      .select('name regNo sectionId')
      .lean<Pick<UserDoc, '_id' | 'name' | 'regNo' | 'sectionId'>[]>(),
    Term.find({ _id: { $in: docs.map((d) => d.termId) } })
      .select('code name')
      .lean<Pick<TermDoc, '_id' | 'code' | 'name'>[]>(),
    getOrgLookup(),
  ]);
  const offers = new Map((await offerDTOs(viewer, offerDocs)).map((o) => [o.id, o]));
  const person = new Map(people.map((p) => [String(p._id), p]));
  const term = new Map(terms.map((t) => [String(t._id), t]));
  const result: RegistrationDTO[] = [];
  for (const doc of docs) {
    const chosen = doc.offerIds.flatMap((id) => {
      const offer = offers.get(String(id));
      return offer ? [offer] : [];
    });
    const { credits, issues } = checkRegistration(
      chosen.map(toOfferLike),
      await studentRecord(doc.studentId),
      doc.heldOfferIds.map(String),
    );
    const student = person.get(String(doc.studentId));
    const advisor = doc.route.userId ? person.get(String(doc.route.userId)) : undefined;
    const t = term.get(String(doc.termId));
    result.push({
      id: String(doc._id),
      term: { id: String(doc.termId), code: t?.code ?? '', name: t?.name ?? '' },
      student: {
        id: String(doc.studentId),
        name: student?.name ?? 'Former student',
        regNo: student?.regNo ?? null,
        sectionName: student?.sectionId
          ? (org.sections.get(String(student.sectionId))?.name ?? null)
          : null,
      },
      status: doc.status,
      offers: chosen,
      credits,
      issues,
      handledBy: doc.route.userId
        ? `${advisor?.name ?? 'Your batch advisor'} (batch advisor)`
        : doc.route.office === 'DEPARTMENT'
          ? `${org.departments.get(String(doc.route.departmentId))?.name ?? 'Department'} office`
          : doc.route.office
            ? OFFICE_LABELS[doc.route.office]
            : 'Nobody yet',
      events: doc.events.map((e) => ({
        at: e.at.toISOString(),
        by: e.byId ? { id: String(e.byId), name: e.byName ?? 'Someone' } : null,
        kind: e.kind,
        body: e.body,
      })),
      submittedAt: doc.submittedAt?.toISOString() ?? null,
      updatedAt: doc.updatedAt.toISOString(),
      canHandle: handles(viewer, doc.route),
    });
  }
  return result;
}

async function toDTO(viewer: UserDoc, doc: RegistrationDoc): Promise<RegistrationDTO> {
  const [dto] = await registrationDTOs(viewer, [doc]);
  if (!dto) throw notFound('Registration not found.');
  return dto;
}

/** Plans the viewer approves: as batch advisor, or as the department office. */
function handlerFilter(viewer: UserDoc): Record<string, unknown> {
  return {
    $or: [
      { 'route.userId': viewer._id },
      ...(viewer.role === 'staff' && viewer.office === 'DEPARTMENT'
        ? [{ 'route.office': 'DEPARTMENT', 'route.departmentId': viewer.departmentId }]
        : []),
    ],
  };
}

export async function registrationHome(viewer: UserDoc): Promise<RegistrationHomeDTO> {
  const [{ ref, doc: term }, window] = await Promise.all([nextTerm(), windowFor(viewer)]);
  const offers = term
    ? await RegistrationOffer.find({ termId: term._id })
        .sort({ code: 1 })
        .lean<RegistrationOfferDoc[]>()
    : [];
  const student = viewer.role === 'student';
  const own =
    student && term
      ? await Registration.findOne({
          studentId: viewer._id,
          termId: term._id,
        }).lean<RegistrationDoc>()
      : null;
  return {
    term: ref,
    window,
    offers: await offerDTOs(viewer, offers),
    registration: own ? await toDTO(viewer, own) : null,
    record: student ? await studentRecord(viewer._id) : null,
    sectionId: idOf(viewer.sectionId),
    waiting:
      term && !student
        ? await Registration.countDocuments({
            termId: term._id,
            status: 'submitted',
            ...handlerFilter(viewer),
          })
        : 0,
    canManageOffers:
      viewer.role === 'admin' || (viewer.role === 'staff' && viewer.office === 'DEPARTMENT'),
  };
}

async function loadNextTermOffers(term: TermDoc, ids: string[]) {
  const unique = [...new Set(ids)];
  const offers = await RegistrationOffer.find({
    _id: { $in: unique.map((id) => toObjectId(id)) },
    termId: term._id,
  }).lean<RegistrationOfferDoc[]>();
  if (offers.length !== unique.length) {
    throw badRequest('Some of those courses are no longer offered. Reload and try again.');
  }
  return offers;
}

/** Saves the student's plan (no checks yet: they are shown as the plan is built). */
export async function savePlan(
  student: UserDoc,
  input: RegistrationPlanInput,
): Promise<RegistrationDTO> {
  if (student.role !== 'student') throw forbidden('Only students register for courses.');
  const { offerIds } = parse(registrationPlanSchema, input);
  await assertOpen(student);
  const term = await ensureNextTerm();
  const offers = await loadNextTermOffers(term, offerIds);
  const current = await Registration.findOne({
    studentId: student._id,
    termId: term._id,
  }).lean<RegistrationDoc>();
  if (current?.status === 'submitted') {
    throw badRequest('Your plan is with your advisor. Withdraw it first to make changes.');
  }
  if (current?.status === 'approved') {
    throw badRequest('Your plan is approved. Ask your batch advisor to return it for changes.');
  }
  let doc: RegistrationDoc | null;
  try {
    doc = await Registration.findOneAndUpdate(
      { studentId: student._id, termId: term._id, status: { $in: ['draft', 'returned'] } },
      {
        // Approved like a leave application: by the batch advisor.
        $set: { offerIds: offers.map((o) => o._id), route: await routeFor(student, 'leave') },
        $setOnInsert: { status: 'draft' },
      },
      { upsert: true, returnDocument: 'after' },
    ).lean<RegistrationDoc>();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw conflict('Your plan changed in another tab. Reload it.');
    throw err;
  }
  if (!doc) throw notFound('Registration not found.');
  return toDTO(student, doc);
}

async function releaseSeats(offerIds: readonly Types.ObjectId[]): Promise<void> {
  if (!offerIds.length) return;
  await RegistrationOffer.updateMany(
    { _id: { $in: offerIds }, seatsTaken: { $gt: 0 } },
    { $inc: { seatsTaken: -1 } },
  );
  await broadcastSeats(offerIds);
}

async function broadcastSeats(offerIds: readonly Types.ObjectId[]): Promise<void> {
  const offers = await RegistrationOffer.find({ _id: { $in: offerIds } })
    .select('seatsTaken')
    .lean();
  broadcastRegistrationSeats(offers.map((o) => ({ id: String(o._id), seatsTaken: o.seatsTaken })));
}

/** Sends the plan to the advisor: every check must pass, and a seat is held in each section. */
export async function submitPlan(student: UserDoc): Promise<RegistrationDTO> {
  if (student.role !== 'student') throw forbidden('Only students register for courses.');
  await assertOpen(student);
  const term = await ensureNextTerm();
  const doc = await Registration.findOne({
    studentId: student._id,
    termId: term._id,
  }).lean<RegistrationDoc>();
  if (!doc || !['draft', 'returned'].includes(doc.status)) {
    throw badRequest(doc ? 'This plan has already been sent.' : 'Pick your courses first.');
  }
  const offers = await loadNextTermOffers(term, doc.offerIds.map(String));
  const dtos = await offerDTOs(student, offers);
  const { issues, credits } = checkRegistration(
    dtos.map(toOfferLike),
    await studentRecord(student._id),
  );
  if (!canSubmit(issues)) {
    throw badRequest(issues.find((i) => i.level === 'block')?.message ?? 'Check your plan.');
  }

  // Hold a seat in each section, never above capacity; give them back if any is full.
  const held: Types.ObjectId[] = [];
  for (const offer of offers) {
    const ok = await RegistrationOffer.findOneAndUpdate(
      { _id: offer._id, $expr: { $lt: ['$seatsTaken', '$capacity'] } },
      { $inc: { seatsTaken: 1 } },
    ).lean();
    if (!ok) {
      await releaseSeats(held);
      const section = dtos.find((d) => d.id === String(offer._id))?.section.name ?? 'that section';
      throw conflict(`${offer.code} (${section}) has just filled up. Pick another section.`);
    }
    held.push(offer._id);
  }
  const now = new Date();
  const updated = await Registration.findOneAndUpdate(
    { _id: doc._id, status: { $in: ['draft', 'returned'] } },
    {
      $set: {
        status: 'submitted',
        heldOfferIds: held,
        submittedAt: now,
        route: await routeFor(student, 'leave'),
      },
      $push: {
        events: {
          at: now,
          byId: student._id,
          byName: student.name,
          kind: 'submitted',
          body: `${offers.length} course${offers.length === 1 ? '' : 's'}, ${credits} credit hours`,
        },
      },
    },
    { returnDocument: 'after' },
  ).lean<RegistrationDoc>();
  if (!updated) {
    await releaseSeats(held);
    throw conflict('Your plan was sent from another tab.');
  }
  await broadcastSeats(held);
  await notify(await handlerIds(updated.route), {
    type: 'registration',
    title: `${student.name} sent a course plan for ${term.name}`,
    body: `${offers.map((o) => o.code).join(', ')} (${credits} credit hours)`,
    link: link(updated._id),
  });
  void recordAudit({
    action: 'registration.submitted',
    actor: student,
    summary: `${student.name} sent a course plan for ${term.name} (${credits} credit hours)`,
    targetType: 'registration',
    targetId: updated._id,
  });
  return toDTO(student, updated);
}

/** Takes a sent plan back to change it (frees its seats). */
export async function withdrawPlan(student: UserDoc): Promise<RegistrationDTO> {
  const term = await ensureNextTerm();
  const doc = await Registration.findOneAndUpdate(
    { studentId: student._id, termId: term._id, status: 'submitted' },
    {
      $set: { status: 'draft', heldOfferIds: [] },
      $push: {
        events: { at: new Date(), byId: student._id, byName: student.name, kind: 'withdrawn' },
      },
    },
  ).lean<RegistrationDoc>();
  if (!doc) throw badRequest('There is no plan waiting for approval to withdraw.');
  await releaseSeats(doc.heldOfferIds);
  await notify(await handlerIds(doc.route), {
    type: 'registration',
    title: `${student.name} took back their course plan`,
    body: 'They are changing it and will send it again.',
    link: link(doc._id),
  });
  const after = await Registration.findById(doc._id).lean<RegistrationDoc>();
  if (!after) throw notFound('Registration not found.');
  return toDTO(student, after);
}

// ---- Advisors ----

async function loadVisible(viewer: UserDoc, registrationId: string) {
  const doc = await Registration.findById(toObjectId(registrationId)).lean<RegistrationDoc>();
  if (!doc) throw notFound('Registration not found.');
  const own = sameId(doc.studentId, viewer._id);
  if (!own && !handles(viewer, doc.route)) throw notFound('Registration not found.');
  return { doc, own };
}

export async function registrationDetail(
  viewer: UserDoc,
  registrationId: string,
): Promise<RegistrationDTO> {
  const { doc } = await loadVisible(viewer, registrationId);
  return toDTO(viewer, doc);
}

/** Plans sent to the viewer this registration (waiting first). */
export async function registrationApprovals(viewer: UserDoc): Promise<RegistrationDTO[]> {
  const { doc: term } = await nextTerm();
  if (!term) return [];
  const docs = await Registration.find({
    termId: term._id,
    status: { $ne: 'draft' },
    ...handlerFilter(viewer),
  })
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean<RegistrationDoc[]>();
  const order = { submitted: 0, returned: 1, approved: 2, draft: 3 } as const;
  return (await registrationDTOs(viewer, docs)).sort((a, b) => order[a.status] - order[b.status]);
}

export async function approvePlan(
  advisor: UserDoc,
  registrationId: string,
  input: RegistrationApproveInput,
): Promise<RegistrationDTO> {
  const { doc } = await loadVisible(advisor, registrationId);
  if (!handles(advisor, doc.route)) throw forbidden('Only the batch advisor can approve it.');
  const { note } = parse(registrationApproveSchema, input);
  const updated = await Registration.findOneAndUpdate(
    { _id: doc._id, status: 'submitted' },
    {
      $set: { status: 'approved' },
      $push: {
        events: {
          at: new Date(),
          byId: advisor._id,
          byName: advisor.name,
          kind: 'approved',
          body: note || null,
        },
      },
    },
    { returnDocument: 'after' },
  ).lean<RegistrationDoc>();
  if (!updated) throw badRequest('Only a plan waiting for approval can be approved.');
  const term = await Term.findById(doc.termId).select('name').lean();
  await notify([doc.studentId], {
    type: 'registration',
    title: 'Course plan approved',
    body: note || `You are registered for ${term?.name ?? 'next term'}.`,
    link: '/academics/registration',
  });
  const student = await User.findById(doc.studentId).select('name').lean();
  void recordAudit({
    action: 'registration.approved',
    actor: advisor,
    summary: `${advisor.name} approved ${student?.name ?? 'a student'}'s course plan`,
    targetType: 'registration',
    targetId: doc._id,
  });
  return toDTO(advisor, updated);
}

/** Sends a plan back with a note (also an approved one, to allow changes); frees its seats. */
export async function returnPlan(
  advisor: UserDoc,
  registrationId: string,
  input: RegistrationReturnInput,
): Promise<RegistrationDTO> {
  const { doc } = await loadVisible(advisor, registrationId);
  if (!handles(advisor, doc.route)) throw forbidden('Only the batch advisor can return it.');
  const { note } = parse(registrationReturnSchema, input);
  const before = await Registration.findOneAndUpdate(
    { _id: doc._id, status: { $in: ['submitted', 'approved'] } },
    {
      $set: { status: 'returned', heldOfferIds: [] },
      $push: {
        events: {
          at: new Date(),
          byId: advisor._id,
          byName: advisor.name,
          kind: 'returned',
          body: note,
        },
      },
    },
  ).lean<RegistrationDoc>();
  if (!before) throw badRequest('Only a sent or approved plan can be returned.');
  await releaseSeats(before.heldOfferIds);
  await notify([doc.studentId], {
    type: 'registration',
    title: 'Course plan returned for changes',
    body: note,
    link: '/academics/registration',
  });
  const after = await Registration.findById(doc._id).lean<RegistrationDoc>();
  if (!after) throw notFound('Registration not found.');
  return toDTO(advisor, after);
}
