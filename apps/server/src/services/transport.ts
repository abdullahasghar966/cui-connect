/**
 * University transport: bus routes with their stops and times. Everyone can read them and
 * follow a route from their stop; IT keeps them up to date. People following a route hear when
 * its times change and when a notice is posted for the day (e.g. running late). Drivers' phone
 * numbers are shown to staff and IT only.
 */
import {
  type BusNoticeInput,
  type BusRouteDTO,
  type BusRouteInput,
  busNoticeSchema,
  busRouteSchema,
  campusClock,
  canManageCampus,
  type SavedRouteInput,
  savedRouteSchema,
  type TransportDTO,
} from '@cui/shared';
import {
  assertAllowed,
  badRequest,
  conflict,
  isDuplicateKeyError,
  notFound,
  parse,
} from '../lib/errors';
import {
  BusRoute,
  type BusRouteDoc,
  SavedRoute,
  type SavedRouteDoc,
  type UserDoc,
} from '../models';
import { recordAudit } from './audit';
import { toObjectId, toPolicyUser } from './mappers';
import { notify } from './notifications';

const describeStops = (doc: Pick<BusRouteDoc, 'stops'>) =>
  doc.stops.map((s) => `${s.name} ${s.morning}/${s.evening}`).join(', ');

async function toDTOs(viewer: UserDoc, docs: BusRouteDoc[]): Promise<BusRouteDTO[]> {
  const saved = await SavedRoute.find({
    userId: viewer._id,
    routeId: { $in: docs.map((d) => d._id) },
  }).lean<SavedRouteDoc[]>();
  const savedBy = new Map(saved.map((s) => [String(s.routeId), s]));
  const staff = viewer.role === 'staff' || viewer.role === 'admin';
  const today = campusClock().date;
  return docs.map((doc) => {
    const mine = savedBy.get(String(doc._id));
    return {
      id: String(doc._id),
      name: doc.name,
      bus: doc.bus,
      capacity: doc.capacity,
      days: doc.days,
      stops: doc.stops.map((s) => ({ name: s.name, morning: s.morning, evening: s.evening })),
      notes: doc.notes,
      driver: staff ? { name: doc.driverName, phone: doc.driverPhone } : null,
      notice: doc.notice?.date === today ? doc.notice.text : null,
      saved: !!mine,
      myStop: mine?.stop ?? null,
      updatedAt: doc.updatedAt.toISOString(),
    };
  });
}

async function toDTO(viewer: UserDoc, doc: BusRouteDoc): Promise<BusRouteDTO> {
  const [dto] = await toDTOs(viewer, [doc]);
  if (!dto) throw notFound('Route not found.');
  return dto;
}

export async function transportHome(viewer: UserDoc): Promise<TransportDTO> {
  const docs = await BusRoute.find().sort({ name: 1 }).lean<BusRouteDoc[]>();
  return {
    routes: await toDTOs(viewer, docs),
    canManage: canManageCampus(toPolicyUser(viewer)).allowed,
  };
}

const followers = (routeId: BusRouteDoc['_id']) => SavedRoute.find({ routeId }).distinct('userId');

export async function saveRoute(
  actor: UserDoc,
  input: BusRouteInput,
  routeId?: string,
): Promise<BusRouteDTO> {
  assertAllowed(canManageCampus(toPolicyUser(actor)));
  const data = parse(busRouteSchema, input);
  const fields = {
    ...data,
    driverName: data.driverName || null,
    driverPhone: data.driverPhone || null,
    notes: data.notes || null,
  };
  const before = routeId ? await BusRoute.findById(toObjectId(routeId)).lean<BusRouteDoc>() : null;
  if (routeId && !before) throw notFound('Route not found.');
  let doc: BusRouteDoc | null;
  try {
    doc = before
      ? await BusRoute.findByIdAndUpdate(
          before._id,
          { $set: fields },
          { returnDocument: 'after' },
        ).lean<BusRouteDoc>()
      : (await BusRoute.create(fields)).toObject<BusRouteDoc>();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw conflict(`There is already a route called ${data.name}.`);
    throw err;
  }
  if (!doc) throw notFound('Route not found.');
  // Followers hear about new times or stops (a stop they used may be gone).
  if (before && describeStops(before) !== describeStops(doc)) {
    const gone = before.stops
      .map((s) => s.name)
      .filter((n) => !doc?.stops.some((s) => s.name === n));
    if (gone.length) {
      await SavedRoute.updateMany(
        { routeId: doc._id, stop: { $in: gone } },
        { $set: { stop: null } },
      );
    }
    await notify(await followers(doc._id), {
      type: 'campus',
      title: `New times for ${doc.name}`,
      body: gone.length
        ? `${gone.join(', ')} ${gone.length === 1 ? 'is' : 'are'} no longer on the route. Check your stop.`
        : 'Check the times at your stop.',
      link: '/campus/transport',
    });
  }
  void recordAudit({
    action: before ? 'route.updated' : 'route.created',
    actor,
    summary: `${actor.name} ${before ? 'updated' : 'added'} the bus route ${doc.name}`,
    targetType: 'route',
    targetId: doc._id,
  });
  return toDTO(actor, doc);
}

export async function deleteRoute(actor: UserDoc, routeId: string): Promise<{ ok: true }> {
  assertAllowed(canManageCampus(toPolicyUser(actor)));
  const doc = await BusRoute.findByIdAndDelete(toObjectId(routeId)).lean<BusRouteDoc>();
  if (!doc) throw notFound('Route not found.');
  const people = await followers(doc._id);
  await SavedRoute.deleteMany({ routeId: doc._id });
  await notify(people, {
    type: 'campus',
    title: `${doc.name} no longer runs`,
    body: 'See the other routes in Transport.',
    link: '/campus/transport',
  });
  void recordAudit({
    action: 'route.deleted',
    actor,
    summary: `${actor.name} removed the bus route ${doc.name}`,
    targetType: 'route',
    targetId: doc._id,
  });
  return { ok: true };
}

/** A notice for today only (null clears it); everyone following the route is told at once. */
export async function setRouteNotice(
  actor: UserDoc,
  routeId: string,
  input: BusNoticeInput,
): Promise<BusRouteDTO> {
  assertAllowed(canManageCampus(toPolicyUser(actor)));
  const { text } = parse(busNoticeSchema, input);
  const doc = await BusRoute.findByIdAndUpdate(
    toObjectId(routeId),
    { $set: { notice: text ? { text, date: campusClock().date } : null } },
    { returnDocument: 'after' },
  ).lean<BusRouteDoc>();
  if (!doc) throw notFound('Route not found.');
  if (text) {
    await notify(await followers(doc._id), {
      type: 'campus',
      title: `${doc.name}: ${text}`,
      body: `Today, ${doc.bus}.`,
      link: '/campus/transport',
    });
  }
  return toDTO(actor, doc);
}

/** Follow a route from a stop (or stop following it). */
export async function setSavedRoute(
  viewer: UserDoc,
  routeId: string,
  input: SavedRouteInput,
): Promise<BusRouteDTO> {
  const { saved, stop } = parse(savedRouteSchema, input);
  const doc = await BusRoute.findById(toObjectId(routeId)).lean<BusRouteDoc>();
  if (!doc) throw notFound('Route not found.');
  if (stop && !doc.stops.some((s) => s.name === stop))
    throw badRequest('That stop is not on this route.');
  if (saved) {
    await SavedRoute.updateOne(
      { userId: viewer._id, routeId: doc._id },
      { $set: { stop: stop || null } },
      { upsert: true },
    );
  } else {
    await SavedRoute.deleteOne({ userId: viewer._id, routeId: doc._id });
  }
  return toDTO(viewer, doc);
}
