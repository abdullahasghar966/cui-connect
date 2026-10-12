/**
 * Student requests and complaints, each routed to whoever handles it: leave goes to the batch
 * advisor (or the department office if the section has none), transcripts and bonafide letters
 * to the Examination Office, ID cards and complaints to Student Affairs. Every change goes on the
 * request's timeline and the other side is told. Approving a leave marks the student "on leave"
 * rather than absent for those days, in every course's attendance.
 */
import {
  canHandleRequest,
  formatShortDate,
  ID_CARD_REASON_LABELS,
  type NewRequestInput,
  newRequestSchema,
  nextStatuses,
  OFFICE_LABELS,
  REQUEST_KIND_LABELS,
  REQUEST_ROUTES,
  type RequestEventDTO,
  type RequestReplyInput,
  type RequestStatusInput,
  requestReplySchema,
  requestStatusLabel,
  requestStatusSchema,
  type ServiceRequestDTO,
} from '@cui/shared';
import type { Types } from 'mongoose';
import { badRequest, forbidden, notFound, parse } from '../lib/errors';
import {
  AttendanceRecord,
  AttendanceSession,
  CourseOffering,
  Section,
  ServiceRequest,
  type ServiceRequestDoc,
  User,
  type UserDoc,
} from '../models';
import { recordAudit } from './audit';
import { getOrgLookup, type Id, idOf, sameId, toObjectId, toPolicyUser } from './mappers';
import { notify } from './notifications';
import { currentTerm } from './terms';

/** Open requests one student may have at a time (keeps the inboxes usable). */
const MAX_OPEN = 10;

type Route = ServiceRequestDoc['route'];

const policyRoute = (route: Route) => ({
  office: route.office,
  departmentId: idOf(route.departmentId),
  userId: idOf(route.userId),
});

const handles = (viewer: UserDoc, doc: Pick<ServiceRequestDoc, 'route'>) =>
  canHandleRequest(toPolicyUser(viewer), policyRoute(doc.route)).allowed;

/** Where this student's request of this kind goes. */
export async function routeFor(student: UserDoc, kind: ServiceRequestDoc['kind']): Promise<Route> {
  const target = REQUEST_ROUTES[kind];
  if (target !== 'ADVISOR') return { office: target, departmentId: null, userId: null };
  const section = student.sectionId
    ? await Section.findById(student.sectionId).select('batchAdvisorId').lean()
    : null;
  const advisor = section?.batchAdvisorId
    ? await User.findOne({ _id: section.batchAdvisorId, active: true }).select('_id').lean()
    : null;
  return advisor
    ? { office: null, departmentId: student.departmentId ?? null, userId: advisor._id }
    : { office: 'DEPARTMENT', departmentId: student.departmentId ?? null, userId: null };
}

/** The people who handle requests on this route. */
export async function handlerIds(route: Route): Promise<Types.ObjectId[]> {
  if (route.userId) return [route.userId];
  if (!route.office) return [];
  return User.find({
    role: 'staff',
    office: route.office,
    active: true,
    ...(route.office === 'DEPARTMENT' ? { departmentId: route.departmentId } : {}),
  }).distinct('_id');
}

function titleFor(input: ReturnType<typeof parse<typeof newRequestSchema>>): string {
  switch (input.kind) {
    case 'leave':
      return input.from === input.to
        ? `Leave on ${formatShortDate(input.from)}`
        : `Leave ${formatShortDate(input.from)} – ${formatShortDate(input.to)}`;
    case 'transcript':
      return `Official transcript (${input.copies} cop${input.copies === 1 ? 'y' : 'ies'})`;
    case 'bonafide':
      return 'Bonafide certificate';
    case 'idcard':
      return `ID card: ${ID_CARD_REASON_LABELS[input.cardReason].toLowerCase()}`;
    case 'complaint':
      return input.subject;
  }
}

/** Builds the DTOs, looking up students' and advisors' names once. */
async function toDTOs(viewer: UserDoc, docs: ServiceRequestDoc[]): Promise<ServiceRequestDTO[]> {
  const ids = [
    ...new Set(
      docs.flatMap((d) => [
        String(d.studentId),
        ...(d.route.userId ? [String(d.route.userId)] : []),
      ]),
    ),
  ];
  const [people, org] = await Promise.all([
    User.find({ _id: { $in: ids.map((id) => toObjectId(id)) } })
      .select('name regNo sectionId')
      .lean<Pick<UserDoc, '_id' | 'name' | 'regNo' | 'sectionId'>[]>(),
    getOrgLookup(),
  ]);
  const byId = new Map(people.map((p) => [String(p._id), p]));
  return docs.map((doc) => {
    const student = byId.get(String(doc.studentId));
    const advisor = doc.route.userId ? byId.get(String(doc.route.userId)) : undefined;
    const handledBy = doc.route.userId
      ? `${advisor?.name ?? 'Your batch advisor'} (batch advisor)`
      : doc.route.office
        ? doc.route.office === 'DEPARTMENT'
          ? `${org.departments.get(String(doc.route.departmentId))?.name ?? 'Department'} office`
          : OFFICE_LABELS[doc.route.office]
        : 'Nobody yet';
    const d = doc.details;
    return {
      id: String(doc._id),
      kind: doc.kind,
      title: doc.title,
      status: doc.status,
      student: {
        id: String(doc.studentId),
        name: student?.name ?? 'Former student',
        regNo: student?.regNo ?? null,
        sectionName: student?.sectionId
          ? (org.sections.get(String(student.sectionId))?.name ?? null)
          : null,
      },
      handledBy,
      details: Object.fromEntries(
        Object.entries({
          from: d.from,
          to: d.to,
          reason: d.reason,
          purpose: d.purpose,
          copies: d.copies,
          cardReason: d.cardReason,
          category: d.category,
          subject: d.subject,
          description: d.description,
        }).filter(([, v]) => v !== null && v !== undefined),
      ),
      events: doc.events.map(
        (e): RequestEventDTO => ({
          at: e.at.toISOString(),
          by: e.byId ? { id: String(e.byId), name: e.byName ?? 'Someone' } : null,
          kind: e.kind,
          status: e.status,
          body: e.body,
        }),
      ),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      canHandle: handles(viewer, doc),
    };
  });
}

async function toDTO(viewer: UserDoc, doc: ServiceRequestDoc): Promise<ServiceRequestDTO> {
  const [dto] = await toDTOs(viewer, [doc]);
  if (!dto) throw notFound('Request not found.');
  return dto;
}

/** The request, if the viewer sent it or handles it (otherwise it doesn't exist for them). */
async function loadVisible(viewer: UserDoc, requestId: string) {
  const doc = await ServiceRequest.findById(toObjectId(requestId)).lean<ServiceRequestDoc>();
  if (!doc) throw notFound('Request not found.');
  const own = sameId(doc.studentId, viewer._id);
  if (!own && !handles(viewer, doc)) throw notFound('Request not found.');
  return { doc, own };
}

const link = (doc: Pick<ServiceRequestDoc, '_id'>) => `/services/requests/${doc._id}`;

// ---- Students ----

export async function createRequest(
  student: UserDoc,
  input: NewRequestInput,
): Promise<ServiceRequestDTO> {
  if (student.role !== 'student') throw forbidden('Requests and complaints are for students.');
  const data = parse(newRequestSchema, input);
  const open = await ServiceRequest.countDocuments({
    studentId: student._id,
    status: { $in: ['submitted', 'in_review'] },
  });
  if (open >= MAX_OPEN) {
    throw badRequest(`You have ${MAX_OPEN} requests open. Wait for some to be answered first.`);
  }
  const route = await routeFor(student, data.kind);
  const now = new Date();
  const doc = (
    await ServiceRequest.create({
      kind: data.kind,
      studentId: student._id,
      route,
      title: titleFor(data),
      details: {
        from: 'from' in data ? data.from : null,
        to: 'to' in data ? data.to : null,
        reason: 'reason' in data ? data.reason : null,
        purpose: 'purpose' in data ? data.purpose : null,
        copies: 'copies' in data ? data.copies : null,
        cardReason: 'cardReason' in data ? data.cardReason : null,
        category: 'category' in data ? data.category : null,
        subject: 'subject' in data ? data.subject : null,
        description: 'description' in data ? (data.description ?? null) : null,
      },
      events: [
        { at: now, byId: student._id, byName: student.name, kind: 'created', status: 'submitted' },
      ],
    })
  ).toObject<ServiceRequestDoc>();

  // The audit log says what kind it was, never the contents (leave reasons, complaints).
  void recordAudit({
    action: 'request.created',
    actor: student,
    summary: `${student.name} sent a ${REQUEST_KIND_LABELS[data.kind].toLowerCase()}`,
    targetType: 'request',
    targetId: doc._id,
  });
  await notify(await handlerIds(route), {
    type: 'requests',
    title: `New ${REQUEST_KIND_LABELS[data.kind].toLowerCase()} from ${student.name}`,
    body: doc.title,
    link: link(doc),
  });
  return toDTO(student, doc);
}

export async function withdrawRequest(
  student: UserDoc,
  requestId: string,
): Promise<ServiceRequestDTO> {
  const { doc, own } = await loadVisible(student, requestId);
  if (!own) throw forbidden('Only the person who sent it can withdraw it.');
  const updated = await ServiceRequest.findOneAndUpdate(
    { _id: doc._id, status: { $in: ['submitted', 'in_review'] } },
    {
      $set: { status: 'withdrawn' },
      $push: {
        events: {
          at: new Date(),
          byId: student._id,
          byName: student.name,
          kind: 'status',
          status: 'withdrawn',
        },
      },
    },
    { returnDocument: 'after' },
  ).lean<ServiceRequestDoc>();
  if (!updated) throw badRequest('It has already been answered, so it can no longer be withdrawn.');
  await notify(await handlerIds(doc.route), {
    type: 'requests',
    title: `${student.name} withdrew a request`,
    body: doc.title,
    link: link(doc),
  });
  return toDTO(student, updated);
}

// ---- Both sides ----

export async function listRequests(
  viewer: UserDoc,
  box: 'mine' | 'inbox',
): Promise<ServiceRequestDTO[]> {
  const handlerFilter = [
    { 'route.userId': viewer._id },
    ...(viewer.role === 'staff' && viewer.office
      ? [
          {
            'route.office': viewer.office,
            ...(viewer.office === 'DEPARTMENT'
              ? { 'route.departmentId': viewer.departmentId }
              : {}),
          },
        ]
      : []),
  ];
  const docs = await ServiceRequest.find(
    box === 'mine' ? { studentId: viewer._id } : { $or: handlerFilter },
  )
    .sort({ updatedAt: -1 })
    .limit(300)
    .lean<ServiceRequestDoc[]>();
  return toDTOs(viewer, docs);
}

export async function requestDetail(
  viewer: UserDoc,
  requestId: string,
): Promise<ServiceRequestDTO> {
  const { doc } = await loadVisible(viewer, requestId);
  return toDTO(viewer, doc);
}

export async function replyToRequest(
  viewer: UserDoc,
  requestId: string,
  input: RequestReplyInput,
): Promise<ServiceRequestDTO> {
  const { doc, own } = await loadVisible(viewer, requestId);
  const { body } = parse(requestReplySchema, input);
  const updated = await ServiceRequest.findByIdAndUpdate(
    doc._id,
    {
      $push: {
        events: { at: new Date(), byId: viewer._id, byName: viewer.name, kind: 'reply', body },
      },
    },
    { returnDocument: 'after' },
  ).lean<ServiceRequestDoc>();
  if (!updated) throw notFound('Request not found.');
  await notify(own ? await handlerIds(doc.route) : [doc.studentId], {
    type: 'requests',
    title: `${viewer.name} replied: ${doc.title}`,
    body: body.length > 140 ? `${body.slice(0, 139)}…` : body,
    link: link(doc),
  });
  return toDTO(viewer, updated);
}

// ---- Handlers ----

export async function changeRequestStatus(
  handler: UserDoc,
  requestId: string,
  input: RequestStatusInput,
): Promise<ServiceRequestDTO> {
  const { doc } = await loadVisible(handler, requestId);
  if (!handles(handler, doc))
    throw forbidden('Only the person or office it was sent to can do that.');
  const { status, note } = parse(requestStatusSchema, input);
  if (!nextStatuses(doc.kind, doc.status).includes(status)) {
    throw badRequest(
      `This ${REQUEST_KIND_LABELS[doc.kind].toLowerCase()} can't go from "${requestStatusLabel(doc.kind, doc.status)}" to "${requestStatusLabel(doc.kind, status)}".`,
    );
  }
  // Conditional on the status we read, so two handlers can't both move it.
  const updated = await ServiceRequest.findOneAndUpdate(
    { _id: doc._id, status: doc.status },
    {
      $set: { status },
      $push: {
        events: {
          at: new Date(),
          byId: handler._id,
          byName: handler.name,
          kind: 'status',
          status,
          body: note || null,
        },
      },
    },
    { returnDocument: 'after' },
  ).lean<ServiceRequestDoc>();
  if (!updated) throw badRequest('Someone else has just answered this request. Reload to see it.');

  let leaveDays = 0;
  if (doc.kind === 'leave' && status === 'approved') leaveDays = await applyLeave(updated);
  const label = requestStatusLabel(doc.kind, status);
  const student = await User.findById(doc.studentId).select('name').lean();
  void recordAudit({
    action: 'request.updated',
    actor: handler,
    summary: `${handler.name} marked ${student?.name ?? 'a student'}'s ${REQUEST_KIND_LABELS[doc.kind].toLowerCase()} "${label}"`,
    targetType: 'request',
    targetId: doc._id,
  });
  await notify([doc.studentId], {
    type: 'requests',
    title:
      doc.kind === 'complaint'
        ? `Your complaint: ${label}`
        : `${REQUEST_KIND_LABELS[doc.kind]}: ${label}`,
    body:
      [
        note,
        leaveDays
          ? `${leaveDays} missed class${leaveDays === 1 ? ' is' : 'es are'} now marked as leave.`
          : null,
      ]
        .filter(Boolean)
        .join(' ') || doc.title,
    link: link(doc),
  });
  return toDTO(handler, updated);
}

// ---- Leave and attendance ----

/** Marks the student's "absent" classes inside an approved leave as "leave"; returns how many. */
async function applyLeave(doc: ServiceRequestDoc): Promise<number> {
  if (!doc.details.from || !doc.details.to) return 0;
  const term = await currentTerm();
  const offerings = await CourseOffering.find({
    termId: term._id,
    studentIds: doc.studentId,
  }).distinct('_id');
  const sessions = await AttendanceSession.find({
    offeringId: { $in: offerings },
    date: { $gte: doc.details.from, $lte: doc.details.to },
  }).distinct('_id');
  const result = await AttendanceRecord.updateMany(
    { sessionId: { $in: sessions }, studentId: doc.studentId, status: 'absent' },
    { $set: { status: 'leave' } },
  );
  return result.modifiedCount;
}

/** Which of these students have an approved leave covering `date` (attendance marks them "leave"). */
export async function studentsOnLeave(
  studentIds: readonly Id[],
  date: string,
): Promise<Set<string>> {
  if (!studentIds.length) return new Set();
  const ids = await ServiceRequest.find({
    kind: 'leave',
    status: 'approved',
    studentId: { $in: studentIds.map((id) => toObjectId(id)) },
    'details.from': { $lte: date },
    'details.to': { $gte: date },
  }).distinct('studentId');
  return new Set(ids.map(String));
}
