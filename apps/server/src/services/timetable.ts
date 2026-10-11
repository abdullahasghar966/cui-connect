/**
 * Timetable: weekly classes of the current term, one-off changes (a class cancelled or moved
 * on one date), clash checks, and "what's next" for each person.
 *
 * Timetables are public on campus (anyone signed in may look at a section, teacher or room).
 * Changing them is not: the weekly grid belongs to IT and the department office; cancelling or
 * moving one class belongs to its instructor. Every change reaches the affected people live.
 */
import {
  addDays,
  BLOCKING_CLASHES,
  type Clash,
  type ClassChangeInput,
  type ClassOccurrenceDTO,
  type ClassSlotDTO,
  type ClassSlotInput,
  campusClock,
  canManageOffering,
  canManageTimetable,
  classSlotSchema,
  findClashes,
  formatClock,
  formatShortDate,
  formatTimeRange,
  mondayOf,
  type OfferingFacts,
  type PolicyUser,
  type RoomRefDTO,
  type SlotCheckDTO,
  type TimetableView,
  type TimetableWeekDTO,
  type TodayDTO,
  timesOverlap,
  toMinutes,
  WEEKDAY_LABELS,
  type Weekday,
  weekdayOf,
} from '@cui/shared';
import { AppError, assertAllowed, badRequest, notFound, parse } from '../lib/errors';
import {
  ClassChange,
  type ClassChangeDoc,
  ClassSlot,
  type ClassSlotDoc,
  CourseOffering,
  type CourseOfferingDoc,
  Group,
  Room,
  type RoomDoc,
  type SectionDoc,
  type TermDoc,
  User,
  type UserDoc,
} from '../models';
import { broadcastTimetableChanged } from '../realtime/notifier';
import { recordAudit } from './audit';
import { getOrgLookup, idOf, type OrgLookup, sameId, toObjectId, toPolicyUser } from './mappers';
import { notify } from './notifications';
import { currentTerm } from './terms';

// ---- Loading the current term ----

interface TermContext {
  term: TermDoc;
  offerings: Map<string, CourseOfferingDoc>;
  slots: ClassSlotDoc[];
  rooms: Map<string, RoomDoc>;
  instructors: Map<string, Pick<UserDoc, '_id' | 'name'>>;
  groupByOffering: Map<string, string>;
  org: OrgLookup;
}

async function loadTerm(): Promise<TermContext> {
  const term = await currentTerm();
  const [offerings, slots, rooms, groups, org] = await Promise.all([
    CourseOffering.find({ termId: term._id }).lean<CourseOfferingDoc[]>(),
    ClassSlot.find({ termId: term._id }).lean<ClassSlotDoc[]>(),
    Room.find().lean<RoomDoc[]>(),
    Group.find({ type: 'COURSE' }).select('_id courseId').lean(),
    getOrgLookup(),
  ]);
  const instructors = await User.find({ _id: { $in: offerings.map((o) => o.instructorId) } })
    .select('name')
    .lean<Pick<UserDoc, '_id' | 'name'>[]>();
  return {
    term,
    offerings: new Map(offerings.map((o) => [String(o._id), o])),
    slots,
    rooms: new Map(rooms.map((r) => [String(r._id), r])),
    instructors: new Map(instructors.map((u) => [String(u._id), u])),
    groupByOffering: new Map(groups.map((g) => [String(g.courseId), String(g._id)])),
    org,
  };
}

export function offeringFacts(
  offering: CourseOfferingDoc,
  section: SectionDoc | undefined,
): OfferingFacts {
  return {
    instructorId: idOf(offering.instructorId),
    sectionId: String(offering.sectionId),
    departmentId: idOf(section?.departmentId),
    studentIds: offering.studentIds.map(String),
  };
}

const roomRef = (room: RoomDoc | undefined): RoomRefDTO | null =>
  room ? { id: String(room._id), name: room.name, block: room.block } : null;

function toSlotDTO(slot: ClassSlotDoc, ctx: TermContext, viewer: UserDoc): ClassSlotDTO {
  const offering = ctx.offerings.get(String(slot.offeringId));
  const section = ctx.org.sections.get(String(slot.sectionId));
  const instructor = ctx.instructors.get(String(slot.instructorId));
  const inCourse =
    !!offering &&
    (sameId(offering.instructorId, viewer._id) ||
      offering.studentIds.some((id) => sameId(id, viewer._id)));
  return {
    id: String(slot._id),
    offeringId: String(slot.offeringId),
    code: offering?.code ?? '',
    title: offering?.title ?? 'Course',
    sectionId: String(slot.sectionId),
    sectionName: section?.name ?? null,
    instructor: instructor ? { id: String(instructor._id), name: instructor.name } : null,
    room: roomRef(slot.roomId ? ctx.rooms.get(String(slot.roomId)) : undefined),
    day: slot.day,
    start: slot.start,
    end: slot.end,
    kind: slot.kind,
    groupId: inCourse ? (ctx.groupByOffering.get(String(slot.offeringId)) ?? null) : null,
    studentCount: offering?.studentIds.length ?? 0,
  };
}

function canChangeSlot(user: PolicyUser, slot: ClassSlotDoc, ctx: TermContext): boolean {
  const offering = ctx.offerings.get(String(slot.offeringId));
  if (!offering) return false;
  const section = ctx.org.sections.get(String(slot.sectionId));
  return (
    canManageOffering(user, offeringFacts(offering, section)).allowed ||
    canManageTimetable(user, idOf(section?.departmentId)).allowed
  );
}

// ---- Expanding weekly classes into dated occurrences ----

const inTerm = (term: TermDoc, date: string) => date >= term.startsOn && date <= term.endsOn;

function expand(
  slots: ClassSlotDoc[],
  changes: ClassChangeDoc[],
  from: string,
  days: number,
  ctx: TermContext,
  viewer: UserDoc,
): Map<string, ClassOccurrenceDTO[]> {
  const user = toPolicyUser(viewer);
  const changeBy = new Map(changes.map((c) => [`${c.slotId}:${c.date}`, c]));
  const byDate = new Map<string, ClassOccurrenceDTO[]>();
  const push = (o: ClassOccurrenceDTO) => byDate.set(o.date, [...(byDate.get(o.date) ?? []), o]);
  const slotById = new Map(slots.map((s) => [String(s._id), s]));

  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    byDate.set(date, byDate.get(date) ?? []);
    if (!inTerm(ctx.term, date)) continue;
    const weekday = weekdayOf(date);
    for (const slot of slots) {
      if (slot.day !== weekday) continue;
      const dto = toSlotDTO(slot, ctx, viewer);
      const change = changeBy.get(`${slot._id}:${date}`);
      const base = {
        slot: dto,
        date,
        start: slot.start,
        end: slot.end,
        room: dto.room,
        note: change?.note ?? null,
        movedTo: null,
        movedFrom: null,
        canChange: canChangeSlot(user, slot, ctx),
      };
      if (!change) push({ ...base, status: 'scheduled' });
      else if (change.kind === 'cancelled') push({ ...base, status: 'cancelled' });
      else {
        push({
          ...base,
          status: 'moved-out',
          movedTo: {
            date: change.newDate ?? date,
            start: change.newStart ?? slot.start,
            end: change.newEnd ?? slot.end,
          },
        });
      }
    }
  }

  // Classes moved *into* the range appear at their new date and time.
  const last = addDays(from, days - 1);
  for (const change of changes) {
    if (change.kind !== 'moved' || !change.newDate) continue;
    if (change.newDate < from || change.newDate > last) continue;
    const slot = slotById.get(String(change.slotId));
    if (!slot) continue;
    const dto = toSlotDTO(slot, ctx, viewer);
    push({
      slot: dto,
      date: change.newDate,
      start: change.newStart ?? slot.start,
      end: change.newEnd ?? slot.end,
      room: change.newRoomId ? roomRef(ctx.rooms.get(String(change.newRoomId))) : dto.room,
      status: 'moved-in',
      note: change.note,
      movedTo: null,
      movedFrom: { date: change.date, start: slot.start },
      canChange: canChangeSlot(user, slot, ctx),
    });
  }

  for (const list of byDate.values()) {
    list.sort((a, b) => a.start.localeCompare(b.start) || a.slot.code.localeCompare(b.slot.code));
  }
  return byDate;
}

function changesBetween(term: TermDoc, from: string, to: string) {
  return ClassChange.find({
    termId: term._id,
    $or: [{ date: { $gte: from, $lte: to } }, { newDate: { $gte: from, $lte: to } }],
  }).lean<ClassChangeDoc[]>();
}

/** Which weekly classes a view shows. */
function slotsFor(
  ctx: TermContext,
  viewer: UserDoc,
  view: TimetableView,
  id: string | undefined,
): { slots: ClassSlotDoc[]; title: string; roomId?: string } {
  const offeringOf = (s: ClassSlotDoc) => ctx.offerings.get(String(s.offeringId));
  switch (view) {
    case 'me': {
      const slots = ctx.slots.filter((s) => {
        const offering = offeringOf(s);
        if (!offering) return false;
        if (viewer.role === 'student')
          return offering.studentIds.some((x) => sameId(x, viewer._id));
        return sameId(s.instructorId, viewer._id);
      });
      return { slots, title: 'Your timetable' };
    }
    case 'section': {
      const section = id ? ctx.org.sections.get(id) : undefined;
      if (!section) throw notFound('Section not found.');
      return { slots: ctx.slots.filter((s) => sameId(s.sectionId, id)), title: section.name };
    }
    case 'teacher': {
      if (!id) throw badRequest('Choose a teacher.');
      return {
        slots: ctx.slots.filter((s) => sameId(s.instructorId, id)),
        title: '', // filled by the caller
      };
    }
    case 'room': {
      const room = id ? ctx.rooms.get(id) : undefined;
      if (!room) throw notFound('Room not found.');
      return { slots: ctx.slots, title: `${room.name} · ${room.block}`, roomId: id };
    }
  }
}

export async function timetableWeek(
  viewer: UserDoc,
  query: { view: TimetableView; id?: string; week?: string },
): Promise<TimetableWeekDTO> {
  const ctx = await loadTerm();
  const weekStart = mondayOf(query.week ?? campusClock().date);
  const { slots, title, roomId } = slotsFor(ctx, viewer, query.view, query.id);
  let heading = title;
  if (query.view === 'teacher') {
    const teacher = await User.findById(query.id).select('name role').lean<UserDoc>();
    if (teacher?.role !== 'faculty') throw notFound('Teacher not found.');
    heading = teacher.name;
  }
  const changes = await changesBetween(ctx.term, weekStart, addDays(weekStart, 5));
  const byDate = expand(slots, changes, weekStart, 6, ctx, viewer);
  return {
    weekStart,
    term: {
      code: ctx.term.code,
      name: ctx.term.name,
      startsOn: ctx.term.startsOn,
      endsOn: ctx.term.endsOn,
    },
    title: heading,
    days: [...byDate.entries()].map(([date, occurrences]) => ({
      date,
      weekday: weekdayOf(date),
      occurrences: roomId ? occurrences.filter((o) => o.room?.id === roomId) : occurrences,
    })),
  };
}

const active = (o: ClassOccurrenceDTO) => o.status === 'scheduled' || o.status === 'moved-in';

/** "Now" and "next" for the Home page, from the campus clock. */
export async function todayFor(viewer: UserDoc, at = new Date()): Promise<TodayDTO> {
  const ctx = await loadTerm();
  const clock = campusClock(at);
  const { slots } = slotsFor(ctx, viewer, 'me', undefined);
  const horizon = 14;
  const changes = await changesBetween(ctx.term, clock.date, addDays(clock.date, horizon));
  const byDate = expand(slots, changes, clock.date, horizon, ctx, viewer);
  const today = (byDate.get(clock.date) ?? []).filter((o) => o.status !== 'moved-out');
  const current =
    today.find(
      (o) => active(o) && toMinutes(o.start) <= clock.minutes && clock.minutes < toMinutes(o.end),
    ) ?? null;
  let next: ClassOccurrenceDTO | null = null;
  for (const [date, list] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    next =
      list.find((o) => active(o) && (date > clock.date || toMinutes(o.start) > clock.minutes)) ??
      null;
    if (next) break;
  }
  return { date: clock.date, current, next, today };
}

// ---- Managing the weekly timetable ----

interface SlotPlan {
  offering: CourseOfferingDoc;
  section: SectionDoc | undefined;
  input: ReturnType<typeof classSlotSchema.parse>;
  room: RoomDoc | undefined;
}

function describeSlot(slot: ClassSlotDoc, ctx: TermContext): string {
  const offering = ctx.offerings.get(String(slot.offeringId));
  const section = ctx.org.sections.get(String(slot.sectionId));
  return `${offering?.code ?? ''} ${offering?.title ?? ''} · ${section?.name ?? ''}`.trim();
}

function when(day: number, start: string, end: string) {
  return `${WEEKDAY_LABELS[day as Weekday]} ${formatTimeRange(start, end)}`;
}

type SlotClash = Omit<Clash, 'slot'> & { slot: ClassSlotDoc };

function explainClashes(clashes: SlotClash[], plan: SlotPlan, ctx: TermContext): SlotCheckDTO {
  const blocking: string[] = [];
  const warnings: string[] = [];
  for (const clash of clashes) {
    const other = describeSlot(clash.slot, ctx);
    const at = when(clash.slot.day, clash.slot.start, clash.slot.end);
    switch (clash.kind) {
      case 'room':
        blocking.push(`${plan.room?.name ?? 'The room'} is already booked ${at} (${other}).`);
        break;
      case 'teacher':
        blocking.push(
          `${ctx.instructors.get(String(plan.offering.instructorId))?.name ?? 'The teacher'} already teaches ${other} ${at}.`,
        );
        break;
      case 'section':
        blocking.push(`${plan.section?.name ?? 'The section'} already has ${other} ${at}.`);
        break;
      case 'students':
        warnings.push(
          `${clash.students} enrolled student${clash.students === 1 ? ' also takes' : 's also take'} ${other} ${at} (repeaters).`,
        );
        break;
    }
  }
  const enrolled = plan.offering.studentIds.length;
  if (plan.room && enrolled > plan.room.capacity) {
    warnings.push(
      `${plan.room.name} seats ${plan.room.capacity} but ${enrolled} students are enrolled.`,
    );
  }
  if (plan.room && plan.input.kind === 'lab' && plan.room.kind !== 'lab') {
    warnings.push(`This lab class is in ${plan.room.name}, which is not a lab.`);
  }
  return { blocking, warnings };
}

async function planSlot(
  actor: UserDoc,
  input: ClassSlotInput,
  ctx: TermContext,
): Promise<SlotPlan> {
  const data = parse(classSlotSchema, input);
  const offering = ctx.offerings.get(data.offeringId);
  if (!offering) throw notFound('That course is not offered this term.');
  const section = ctx.org.sections.get(String(offering.sectionId));
  assertAllowed(canManageTimetable(toPolicyUser(actor), idOf(section?.departmentId)));
  const room = data.roomId ? ctx.rooms.get(data.roomId) : undefined;
  if (data.roomId && !room) throw notFound('Room not found.');
  return { offering, section, input: data, room };
}

function clashesFor(plan: SlotPlan, ctx: TermContext, ignoreSlotId?: string) {
  const withStudents = ctx.slots
    .filter((s) => !ignoreSlotId || String(s._id) !== ignoreSlotId)
    .map((s) => ({
      ...s,
      id: String(s._id),
      roomId: idOf(s.roomId),
      instructorId: String(s.instructorId),
      sectionId: String(s.sectionId),
      studentIds: (ctx.offerings.get(String(s.offeringId))?.studentIds ?? []).map(String),
    }));
  const found = findClashes(
    {
      day: plan.input.day,
      start: plan.input.start,
      end: plan.input.end,
      roomId: plan.input.roomId,
      instructorId: String(plan.offering.instructorId),
      sectionId: String(plan.offering.sectionId),
      studentIds: plan.offering.studentIds.map(String),
    },
    withStudents,
  );
  const docs = new Map(ctx.slots.map((s) => [String(s._id), s]));
  return found.map((c): SlotClash => ({ ...c, slot: docs.get(c.slot.id) as ClassSlotDoc }));
}

/** Dry run for the editor: what would happen if this class were saved. */
export async function checkSlot(
  actor: UserDoc,
  input: ClassSlotInput,
  slotId?: string,
): Promise<SlotCheckDTO> {
  const ctx = await loadTerm();
  const plan = await planSlot(actor, input, ctx);
  return explainClashes(clashesFor(plan, ctx, slotId), plan, ctx);
}

async function tellCourse(
  offering: CourseOfferingDoc,
  title: string,
  body: string,
  link: string,
  options: { key?: string; except?: UserDoc } = {},
) {
  const people = [...offering.studentIds, offering.instructorId].filter(
    (id) => !options.except || !sameId(id, options.except._id),
  );
  await notify(people, { type: 'timetable', title, body, link, key: options.key });
}

const courseName = (offering: CourseOfferingDoc, section: SectionDoc | undefined) =>
  `${offering.title} · ${section?.name ?? ''}`;

export async function saveSlot(
  actor: UserDoc,
  slotId: string | null,
  input: ClassSlotInput,
): Promise<{ slot: ClassSlotDTO; warnings: string[] }> {
  const ctx = await loadTerm();
  const existing = slotId ? ctx.slots.find((s) => String(s._id) === slotId) : undefined;
  if (slotId && !existing) throw notFound('Class not found.');
  if (existing) {
    // Moving a class out of a department needs rights over its current department too.
    const section = ctx.org.sections.get(String(existing.sectionId));
    assertAllowed(canManageTimetable(toPolicyUser(actor), idOf(section?.departmentId)));
  }
  const plan = await planSlot(actor, input, ctx);
  const { blocking, warnings } = explainClashes(
    clashesFor(plan, ctx, slotId ?? undefined),
    plan,
    ctx,
  );
  if (blocking.length)
    throw new AppError(409, 'CONFLICT', blocking.join(' '), { blocking, warnings });

  const fields = {
    offeringId: plan.offering._id,
    termId: ctx.term._id,
    sectionId: plan.offering.sectionId,
    instructorId: plan.offering.instructorId,
    roomId: plan.input.roomId ? toObjectId(plan.input.roomId) : null,
    day: plan.input.day,
    start: plan.input.start,
    end: plan.input.end,
    kind: plan.input.kind,
  };
  const saved = existing
    ? await ClassSlot.findByIdAndUpdate(
        existing._id,
        { $set: fields },
        { returnDocument: 'after' },
      ).lean<ClassSlotDoc>()
    : (await ClassSlot.create(fields)).toObject<ClassSlotDoc>();
  if (!saved) throw notFound('Class not found.');
  ctx.slots = [...ctx.slots.filter((s) => String(s._id) !== String(saved._id)), saved];

  const label = courseName(plan.offering, plan.section);
  const at = `${when(saved.day, saved.start, saved.end)}${plan.room ? ` in ${plan.room.name}` : ''}`;
  void recordAudit({
    action: existing ? 'timetable.updated' : 'timetable.created',
    actor,
    summary: `${actor.name} ${existing ? 'moved' : 'scheduled'} ${label}: ${at}`,
    targetType: 'course',
    targetId: plan.offering._id,
  });
  // One notification per course per day, however many classes are edited.
  await tellCourse(
    plan.offering,
    `Your timetable changed: ${label}`,
    `Now ${at}.`,
    '/academics/timetable',
    {
      key: `timetable:${plan.offering._id}:${campusClock().date}`,
      except: actor,
    },
  );
  broadcastTimetableChanged([String(plan.offering._id)]);
  return { slot: toSlotDTO(saved, ctx, actor), warnings };
}

export async function deleteSlot(actor: UserDoc, slotId: string): Promise<void> {
  const ctx = await loadTerm();
  const slot = ctx.slots.find((s) => String(s._id) === slotId);
  if (!slot) throw notFound('Class not found.');
  const section = ctx.org.sections.get(String(slot.sectionId));
  assertAllowed(canManageTimetable(toPolicyUser(actor), idOf(section?.departmentId)));
  await ClassSlot.deleteOne({ _id: slot._id });
  await ClassChange.deleteMany({ slotId: slot._id });
  const offering = ctx.offerings.get(String(slot.offeringId));
  void recordAudit({
    action: 'timetable.deleted',
    actor,
    summary: `${actor.name} removed ${describeSlot(slot, ctx)} on ${when(slot.day, slot.start, slot.end)}`,
    targetType: 'course',
    targetId: slot.offeringId,
  });
  if (offering) {
    await tellCourse(
      offering,
      `Your timetable changed: ${courseName(offering, section)}`,
      `The ${when(slot.day, slot.start, slot.end)} class was removed.`,
      '/academics/timetable',
      { key: `timetable:${offering._id}:${campusClock().date}`, except: actor },
    );
  }
  broadcastTimetableChanged([String(slot.offeringId)]);
}

/** Every weekly class of a section (the editor's raw view). */
export async function listSectionSlots(
  viewer: UserDoc,
  sectionId: string,
): Promise<ClassSlotDTO[]> {
  const ctx = await loadTerm();
  return ctx.slots
    .filter((s) => sameId(s.sectionId, sectionId))
    .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))
    .map((s) => toSlotDTO(s, ctx, viewer));
}

// ---- One-off changes: cancel, move, restore ----

/** Everything happening on a date, after changes, to check a moved class against. */
async function occupiedOn(ctx: TermContext, viewer: UserDoc, date: string) {
  const changes = await changesBetween(ctx.term, date, date);
  return expand(ctx.slots, changes, date, 1, ctx, viewer).get(date) ?? [];
}

export async function changeClass(
  actor: UserDoc,
  slotId: string,
  input: ClassChangeInput,
): Promise<void> {
  const ctx = await loadTerm();
  const slot = ctx.slots.find((s) => String(s._id) === slotId);
  if (!slot) throw notFound('Class not found.');
  const offering = ctx.offerings.get(String(slot.offeringId));
  if (!offering) throw notFound('Course not found.');
  const section = ctx.org.sections.get(String(slot.sectionId));
  if (!canChangeSlot(toPolicyUser(actor), slot, ctx)) {
    assertAllowed(canManageOffering(toPolicyUser(actor), offeringFacts(offering, section)));
  }

  const today = campusClock().date;
  if (weekdayOf(input.date) !== slot.day || !inTerm(ctx.term, input.date)) {
    throw badRequest(`This class doesn't meet on ${formatShortDate(input.date)}.`);
  }
  if (input.date < today) throw badRequest('Past classes cannot be changed.');

  let roomName: string | null = null;
  if (input.kind === 'moved') {
    if (input.newDate < today) throw badRequest('Move the class to today or a later date.');
    if (!inTerm(ctx.term, input.newDate) || weekdayOf(input.newDate) > 6) {
      throw badRequest('Choose a teaching day (Monday to Saturday) within the term.');
    }
    const newRoom = input.newRoomId ? ctx.rooms.get(input.newRoomId) : undefined;
    if (input.newRoomId && !newRoom) throw notFound('Room not found.');
    roomName = newRoom?.name ?? null;
    const busy = (await occupiedOn(ctx, actor, input.newDate)).filter(
      (o) =>
        active(o) &&
        !(o.slot.id === slotId && o.date === input.date) &&
        timesOverlap(o.start, o.end, input.newStart, input.newEnd),
    );
    const problems: string[] = [];
    for (const o of busy) {
      const what = `${o.slot.code} ${o.slot.title} · ${o.slot.sectionName ?? ''}`;
      if (input.newRoomId && o.room?.id === input.newRoomId)
        problems.push(`${roomName} is booked for ${what}.`);
      if (sameId(o.slot.instructor?.id, offering.instructorId))
        problems.push(`The teacher has ${what} then.`);
      if (o.slot.sectionId === String(offering.sectionId))
        problems.push(`${section?.name ?? 'The section'} has ${what} then.`);
    }
    if (problems.length) throw new AppError(409, 'CONFLICT', [...new Set(problems)].join(' '));
  }

  await ClassChange.findOneAndUpdate(
    { slotId: slot._id, date: input.date },
    {
      $set: {
        offeringId: offering._id,
        termId: ctx.term._id,
        kind: input.kind,
        newDate: input.kind === 'moved' ? input.newDate : null,
        newStart: input.kind === 'moved' ? input.newStart : null,
        newEnd: input.kind === 'moved' ? input.newEnd : null,
        newRoomId: input.kind === 'moved' && input.newRoomId ? toObjectId(input.newRoomId) : null,
        note: input.note || null,
        byId: actor._id,
      },
    },
    { upsert: true },
  );

  const label = courseName(offering, section);
  const original = `${formatShortDate(input.date)}, ${formatClock(slot.start)}`;
  const title =
    input.kind === 'cancelled'
      ? `${label} on ${formatShortDate(input.date)} is cancelled`
      : `${label} moved to ${formatShortDate(input.newDate)}, ${formatClock(input.newStart)}`;
  const body =
    input.kind === 'cancelled'
      ? [`The ${original} class won't take place.`, input.note].filter(Boolean).join(' ')
      : [`Instead of ${original}.`, roomName ? `Room: ${roomName}.` : null, input.note]
          .filter(Boolean)
          .join(' ');
  void recordAudit({
    action: `class.${input.kind}`,
    actor,
    summary: `${actor.name}: ${title}`,
    targetType: 'course',
    targetId: offering._id,
  });
  await tellCourse(
    offering,
    title,
    body,
    `/academics/timetable?week=${input.kind === 'moved' ? input.newDate : input.date}`,
    {
      except: actor,
    },
  );
  broadcastTimetableChanged([String(offering._id)]);
}

export async function restoreClass(actor: UserDoc, slotId: string, date: string): Promise<void> {
  const ctx = await loadTerm();
  const slot = ctx.slots.find((s) => String(s._id) === slotId);
  if (!slot) throw notFound('Class not found.');
  const offering = ctx.offerings.get(String(slot.offeringId));
  if (!offering) throw notFound('Course not found.');
  const section = ctx.org.sections.get(String(slot.sectionId));
  if (!canChangeSlot(toPolicyUser(actor), slot, ctx)) {
    assertAllowed(canManageOffering(toPolicyUser(actor), offeringFacts(offering, section)));
  }
  const removed = await ClassChange.findOneAndDelete({ slotId: slot._id, date }).lean();
  if (!removed) throw notFound('There is no change to undo for that date.');
  const label = courseName(offering, section);
  const title = `${label} on ${formatShortDate(date)} is back on`;
  void recordAudit({
    action: 'class.restored',
    actor,
    summary: `${actor.name}: ${title}`,
    targetType: 'course',
    targetId: offering._id,
  });
  await tellCourse(
    offering,
    title,
    `As usual: ${formatTimeRange(slot.start, slot.end)}.`,
    `/academics/timetable?week=${date}`,
    { except: actor },
  );
  broadcastTimetableChanged([String(offering._id)]);
}

/** Rooms that still have classes can't be deleted. */
export async function roomInUse(roomId: string): Promise<boolean> {
  return !!(await ClassSlot.exists({ roomId: toObjectId(roomId) }));
}
