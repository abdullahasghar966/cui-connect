/**
 * Campus events with RSVP.
 *
 * Offices and IT publish events directly; a student's or teacher's event waits for Student
 * Affairs, who approve it or say why not. Anyone signed in can answer "going" or "interested";
 * "going" holds one of the event's places (atomically, never above the limit) and every open
 * page sees the counts change. People going are reminded the evening before, and told if the
 * event moves or is cancelled.
 */
import {
  type CampusEventDTO,
  type CampusEventInput,
  campusClock,
  campusEventSchema,
  canManageStudentAffairs,
  canPublishEvent,
  type EventCancelInput,
  type EventDecisionInput,
  type EventDetailDTO,
  type EventsHomeDTO,
  eventCancelSchema,
  eventDecisionSchema,
  formatClock,
  formatShortDate,
  type RsvpInput,
  type RsvpStatus,
  rsvpSchema,
} from '@cui/shared';
import type { Types } from 'mongoose';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/errors';
import {
  CampusEvent,
  type CampusEventDoc,
  EventRsvp,
  type EventRsvpDoc,
  User,
  type UserDoc,
} from '../models';
import { broadcastEventRsvps } from '../realtime/notifier';
import { recordAudit } from './audit';
import { getOrgLookup, sameId, toObjectId, toPolicyUser } from './mappers';
import { notify } from './notifications';

const link = (id: Types.ObjectId | string) => `/campus/events/${id}`;

const moderates = (viewer: UserDoc) => canManageStudentAffairs(toPolicyUser(viewer)).allowed;

const when = (e: Pick<CampusEventDoc, 'date' | 'start'>) =>
  `${formatShortDate(e.date)} at ${formatClock(e.start)}`;

async function toDTOs(viewer: UserDoc, docs: CampusEventDoc[]): Promise<CampusEventDTO[]> {
  if (!docs.length) return [];
  const [creators, mine] = await Promise.all([
    User.find({ _id: { $in: docs.map((d) => d.createdById) } })
      .select('name')
      .lean<Pick<UserDoc, '_id' | 'name'>[]>(),
    EventRsvp.find({ userId: viewer._id, eventId: { $in: docs.map((d) => d._id) } })
      .select('eventId status')
      .lean<Pick<EventRsvpDoc, 'eventId' | 'status'>[]>(),
  ]);
  const name = new Map(creators.map((c) => [String(c._id), c.name]));
  const rsvp = new Map(mine.map((r) => [String(r.eventId), r.status]));
  const moderator = moderates(viewer);
  return docs.map((doc) => ({
    id: String(doc._id),
    title: doc.title,
    description: doc.description,
    category: doc.category,
    date: doc.date,
    start: doc.start,
    end: doc.end,
    venue: doc.venue,
    organiser: doc.organiser,
    capacity: doc.capacity,
    going: doc.going,
    interested: doc.interested,
    status: doc.status,
    createdBy: {
      id: String(doc.createdById),
      name: name.get(String(doc.createdById)) ?? 'Someone',
    },
    note: doc.note,
    myRsvp: rsvp.get(String(doc._id)) ?? null,
    canEdit: moderator || sameId(doc.createdById, viewer._id),
    canModerate: moderator,
  }));
}

/** The event, if the viewer may see it (published, or theirs, or they moderate). */
async function loadVisible(viewer: UserDoc, eventId: string): Promise<CampusEventDoc> {
  const doc = await CampusEvent.findById(toObjectId(eventId)).lean<CampusEventDoc>();
  if (!doc) throw notFound('Event not found.');
  const visible =
    doc.status === 'published' ||
    doc.status === 'cancelled' ||
    sameId(doc.createdById, viewer._id) ||
    moderates(viewer);
  if (!visible) throw notFound('Event not found.');
  return doc;
}

async function toDTO(viewer: UserDoc, doc: CampusEventDoc): Promise<CampusEventDTO> {
  const [dto] = await toDTOs(viewer, [doc]);
  if (!dto) throw notFound('Event not found.');
  return dto;
}

export async function eventsHome(viewer: UserDoc): Promise<EventsHomeDTO> {
  const today = campusClock().date;
  const moderator = moderates(viewer);
  const [upcoming, past, waiting] = await Promise.all([
    CampusEvent.find({ status: { $in: ['published', 'cancelled'] }, date: { $gte: today } })
      .sort({ date: 1, start: 1 })
      .limit(100)
      .lean<CampusEventDoc[]>(),
    CampusEvent.find({ status: 'published', date: { $lt: today } })
      .sort({ date: -1, start: -1 })
      .limit(30)
      .lean<CampusEventDoc[]>(),
    CampusEvent.find(
      moderator
        ? { status: 'pending' }
        : { createdById: viewer._id, status: { $in: ['pending', 'rejected'] } },
    )
      .sort({ date: 1 })
      .limit(100)
      .lean<CampusEventDoc[]>(),
  ]);
  return {
    upcoming: await toDTOs(viewer, upcoming),
    past: await toDTOs(viewer, past),
    waiting: await toDTOs(viewer, waiting),
    canPublish: canPublishEvent(toPolicyUser(viewer)).allowed,
    canModerate: moderator,
  };
}

export async function eventDetail(viewer: UserDoc, eventId: string): Promise<EventDetailDTO> {
  const doc = await loadVisible(viewer, eventId);
  const dto = await toDTO(viewer, doc);
  if (!dto.canEdit) return { ...dto, attendees: null };
  const rsvps = await EventRsvp.find({ eventId: doc._id, status: 'going' })
    .select('userId')
    .lean<Pick<EventRsvpDoc, 'userId'>[]>();
  const [people, org] = await Promise.all([
    User.find({ _id: { $in: rsvps.map((r) => r.userId) } })
      .select('name regNo designation sectionId')
      .sort({ name: 1 })
      .lean<Pick<UserDoc, '_id' | 'name' | 'regNo' | 'designation' | 'sectionId'>[]>(),
    getOrgLookup(),
  ]);
  return {
    ...dto,
    attendees: people.map((p) => ({
      id: String(p._id),
      name: p.name,
      detail:
        [p.regNo, p.sectionId ? org.sections.get(String(p.sectionId))?.name : null]
          .filter(Boolean)
          .join(' · ') ||
        p.designation ||
        null,
    })),
  };
}

async function affairsStaff(): Promise<Types.ObjectId[]> {
  return User.find({ role: 'staff', office: 'STUDENT_AFFAIRS', active: true }).distinct('_id');
}

export async function createEvent(
  viewer: UserDoc,
  input: CampusEventInput,
): Promise<CampusEventDTO> {
  const data = parse(campusEventSchema, input);
  if (data.date < campusClock().date) throw badRequest("The event's date has already passed.");
  const direct = canPublishEvent(toPolicyUser(viewer)).allowed;
  const doc = (
    await CampusEvent.create({
      ...data,
      capacity: data.capacity ?? null,
      status: direct ? 'published' : 'pending',
      createdById: viewer._id,
    })
  ).toObject<CampusEventDoc>();
  void recordAudit({
    action: direct ? 'event.published' : 'event.proposed',
    actor: viewer,
    summary: `${viewer.name} ${direct ? 'published' : 'proposed'} the event "${doc.title}"`,
    targetType: 'event',
    targetId: doc._id,
  });
  if (!direct) {
    await notify(await affairsStaff(), {
      type: 'events',
      title: `Event to approve: ${doc.title}`,
      body: `${viewer.name} · ${when(doc)} · ${doc.venue}`,
      link: link(doc._id),
    });
  }
  return toDTO(viewer, doc);
}

async function goingIds(eventId: Types.ObjectId, statuses: RsvpStatus[] = ['going']) {
  return EventRsvp.find({ eventId, status: { $in: statuses } }).distinct('userId');
}

export async function updateEvent(
  viewer: UserDoc,
  eventId: string,
  input: CampusEventInput,
): Promise<CampusEventDTO> {
  const doc = await loadVisible(viewer, eventId);
  if (!moderates(viewer) && !sameId(doc.createdById, viewer._id)) {
    throw forbidden('Only its organiser or Student Affairs can change this event.');
  }
  if (doc.status === 'cancelled') throw badRequest('This event was cancelled.');
  const data = parse(campusEventSchema, input);
  if (data.capacity && data.capacity < doc.going) {
    throw badRequest(`${doc.going} people are already going; the limit can't be lower.`);
  }
  const updated = await CampusEvent.findByIdAndUpdate(
    doc._id,
    { $set: { ...data, capacity: data.capacity ?? null } },
    { returnDocument: 'after' },
  ).lean<CampusEventDoc>();
  if (!updated) throw notFound('Event not found.');
  const moved =
    doc.date !== updated.date ||
    doc.start !== updated.start ||
    doc.end !== updated.end ||
    doc.venue !== updated.venue;
  if (moved && updated.status === 'published') {
    await notify(await goingIds(doc._id, ['going', 'interested']), {
      type: 'events',
      title: `Changed: ${updated.title}`,
      body: `Now ${when(updated)} · ${updated.venue}`,
      link: link(doc._id),
    });
  }
  return toDTO(viewer, updated);
}

/** Student Affairs publish a proposed event, or say why not. */
export async function decideEvent(
  moderator: UserDoc,
  eventId: string,
  input: EventDecisionInput,
): Promise<CampusEventDTO> {
  if (!moderates(moderator)) throw forbidden('Only Student Affairs approves events.');
  const { approve, note } = parse(eventDecisionSchema, input);
  if (!approve && !note) throw badRequest('Say why it is not approved.');
  const doc = await CampusEvent.findOneAndUpdate(
    { _id: toObjectId(eventId), status: 'pending' },
    {
      $set: {
        status: approve ? 'published' : 'rejected',
        decidedById: moderator._id,
        note: note || null,
      },
    },
    { returnDocument: 'after' },
  ).lean<CampusEventDoc>();
  if (!doc) throw badRequest('Only an event waiting for approval can be decided.');
  await notify([doc.createdById], {
    type: 'events',
    title: approve
      ? `Your event is published: ${doc.title}`
      : `Your event was not approved: ${doc.title}`,
    body: note || (approve ? `${when(doc)} · ${doc.venue}` : null),
    link: link(doc._id),
  });
  void recordAudit({
    action: approve ? 'event.approved' : 'event.rejected',
    actor: moderator,
    summary: `${moderator.name} ${approve ? 'approved' : 'turned down'} the event "${doc.title}"`,
    targetType: 'event',
    targetId: doc._id,
  });
  return toDTO(moderator, doc);
}

export async function cancelEvent(
  viewer: UserDoc,
  eventId: string,
  input: EventCancelInput,
): Promise<CampusEventDTO> {
  const doc = await loadVisible(viewer, eventId);
  if (!moderates(viewer) && !sameId(doc.createdById, viewer._id)) {
    throw forbidden('Only its organiser or Student Affairs can cancel this event.');
  }
  const { note } = parse(eventCancelSchema, input);
  const updated = await CampusEvent.findOneAndUpdate(
    { _id: doc._id, status: { $in: ['published', 'pending'] } },
    { $set: { status: 'cancelled', note: note || null } },
    { returnDocument: 'after' },
  ).lean<CampusEventDoc>();
  if (!updated) throw badRequest('This event can no longer be cancelled.');
  await notify(await goingIds(doc._id, ['going', 'interested']), {
    type: 'events',
    title: `Cancelled: ${doc.title}`,
    body: note || `It was planned for ${when(doc)}.`,
    link: link(doc._id),
  });
  void recordAudit({
    action: 'event.cancelled',
    actor: viewer,
    summary: `${viewer.name} cancelled the event "${doc.title}"`,
    targetType: 'event',
    targetId: doc._id,
  });
  return toDTO(viewer, updated);
}

/** Going, interested, or neither. "Going" takes a place if the event has a limit. */
export async function rsvpEvent(
  viewer: UserDoc,
  eventId: string,
  input: RsvpInput,
): Promise<CampusEventDTO> {
  const { status } = parse(rsvpSchema, input);
  const doc = await loadVisible(viewer, eventId);
  if (doc.status !== 'published') throw badRequest('You can only answer published events.');
  if (doc.date < campusClock().date) throw badRequest('This event has already happened.');
  const key = { eventId: doc._id, userId: viewer._id };
  const current = await EventRsvp.findOne(key).lean();
  if ((current?.status ?? null) === status) return toDTO(viewer, doc);

  // Take a place first (never above the limit), so a full event refuses cleanly.
  if (status === 'going') {
    const taken = await CampusEvent.updateOne(
      {
        _id: doc._id,
        status: 'published',
        $or: [{ capacity: null }, { $expr: { $lt: ['$going', '$capacity'] } }],
      },
      { $inc: { going: 1 } },
    );
    if (!taken.modifiedCount) throw conflict('This event is full.');
  }
  // The answer before this one, read in the same write (so a double click counts once).
  const before = status
    ? await EventRsvp.findOneAndUpdate(key, { $set: { status } }, { upsert: true }).lean()
    : await EventRsvp.findOneAndDelete(key).lean();
  const previous = before?.status ?? null;
  const change: Record<string, number> = {};
  if (status === 'going' && previous === 'going') {
    change.going = -1; // already going: give back the place just taken
  } else {
    if (previous) change[previous] = (change[previous] ?? 0) - 1;
    if (status === 'interested') change.interested = (change.interested ?? 0) + 1;
  }
  const after = Object.keys(change).length
    ? await CampusEvent.findByIdAndUpdate(
        doc._id,
        { $inc: change },
        { returnDocument: 'after' },
      ).lean<CampusEventDoc>()
    : await CampusEvent.findById(doc._id).lean<CampusEventDoc>();
  if (!after) throw notFound('Event not found.');
  broadcastEventRsvps({
    eventId: String(after._id),
    going: after.going,
    interested: after.interested,
  });
  return toDTO(viewer, after);
}

/** Events the viewer is going to between two dates (for My calendar). */
export async function myGoingEvents(viewer: UserDoc, from: string, to: string) {
  const ids = await EventRsvp.find({ userId: viewer._id, status: 'going' }).distinct('eventId');
  return CampusEvent.find({
    _id: { $in: ids },
    status: 'published',
    date: { $gte: from, $lte: to },
  }).lean<CampusEventDoc[]>();
}
