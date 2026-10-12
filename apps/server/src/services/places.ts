/**
 * The campus map's offices and facilities (library, cafeteria, medical centre…) with opening
 * hours. Everyone can read them; IT keeps them up to date. Rooms and what is on in them come
 * from the room finder, so the map needs nothing else.
 */
import {
  type CampusPlaceDTO,
  type CampusPlaceInput,
  type CampusPlacesDTO,
  campusClock,
  campusPlaceSchema,
  canManageCampus,
  isOpenAt,
} from '@cui/shared';
import { assertAllowed, conflict, isDuplicateKeyError, notFound, parse } from '../lib/errors';
import { CampusPlace, type CampusPlaceDoc, type UserDoc } from '../models';
import { recordAudit } from './audit';
import { toObjectId, toPolicyUser } from './mappers';

function toDTO(doc: CampusPlaceDoc, now = campusClock()): CampusPlaceDTO {
  return {
    id: String(doc._id),
    name: doc.name,
    kind: doc.kind,
    block: doc.block,
    floor: doc.floor,
    description: doc.description,
    office: doc.office,
    hours: doc.hours.map((h) => ({ days: h.days, open: h.open, close: h.close })),
    openNow: doc.hours.length ? isOpenAt(doc.hours, now.weekday, now.minutes) : null,
  };
}

export async function listPlaces(viewer: UserDoc): Promise<CampusPlacesDTO> {
  const docs = await CampusPlace.find()
    .sort({ block: 1, floor: 1, name: 1 })
    .lean<CampusPlaceDoc[]>();
  const now = campusClock();
  return {
    places: docs.map((d) => toDTO(d, now)),
    canManage: canManageCampus(toPolicyUser(viewer)).allowed,
  };
}

export async function savePlace(
  actor: UserDoc,
  input: CampusPlaceInput,
  placeId?: string,
): Promise<CampusPlaceDTO> {
  assertAllowed(canManageCampus(toPolicyUser(actor)));
  const data = parse(campusPlaceSchema, input);
  const fields = { ...data, description: data.description || null, office: data.office ?? null };
  let doc: CampusPlaceDoc | null;
  try {
    doc = placeId
      ? await CampusPlace.findByIdAndUpdate(
          toObjectId(placeId),
          { $set: fields },
          {
            returnDocument: 'after',
          },
        ).lean<CampusPlaceDoc>()
      : (await CampusPlace.create(fields)).toObject<CampusPlaceDoc>();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw conflict(`There is already a place called ${data.name}.`);
    throw err;
  }
  if (!doc) throw notFound('Place not found.');
  void recordAudit({
    action: placeId ? 'place.updated' : 'place.created',
    actor,
    summary: `${actor.name} ${placeId ? 'updated' : 'added'} ${doc.name} on the campus map`,
    targetType: 'place',
    targetId: doc._id,
  });
  return toDTO(doc);
}

export async function deletePlace(actor: UserDoc, placeId: string): Promise<{ ok: true }> {
  assertAllowed(canManageCampus(toPolicyUser(actor)));
  const doc = await CampusPlace.findByIdAndDelete(toObjectId(placeId)).lean<CampusPlaceDoc>();
  if (!doc) throw notFound('Place not found.');
  void recordAudit({
    action: 'place.deleted',
    actor,
    summary: `${actor.name} removed ${doc.name} from the campus map`,
    targetType: 'place',
    targetId: doc._id,
  });
  return { ok: true };
}
