/**
 * Lost & found. Anyone reports something they lost or found (with a photo if they like). Others
 * answer "This is mine" or "I found it" with a detail only the owner would know; the person who
 * reported it (or Student Affairs, who keep found items) sees those answers and marks the item
 * returned, telling whoever it went back to. Phone numbers are never shown: people are named and
 * the handover happens at Student Affairs.
 */
import {
  canManageStudentAffairs,
  type LostClaimDTO,
  type LostClaimInput,
  type LostFoundHomeDTO,
  type LostItemDTO,
  type LostItemInput,
  lostClaimSchema,
  lostItemSchema,
  type ResolveItemInput,
  resolveItemSchema,
} from '@cui/shared';
import {
  badRequest,
  conflict,
  forbidden,
  isDuplicateKeyError,
  notFound,
  parse,
} from '../lib/errors';
import {
  LostClaim,
  type LostClaimDoc,
  LostItem,
  type LostItemDoc,
  User,
  type UserDoc,
} from '../models';
import { recordAudit } from './audit';
import { claimFiles, deleteFiles, filesByIds, toFileDTO } from './files';
import { getOrgLookup, sameId, toObjectId, toPolicyUser } from './mappers';
import { notify } from './notifications';

const link = (id: unknown) => `/campus/lost-found/${String(id)}`;

const moderates = (viewer: UserDoc) => canManageStudentAffairs(toPolicyUser(viewer)).allowed;

const canResolve = (viewer: UserDoc, doc: LostItemDoc) =>
  sameId(doc.reporterId, viewer._id) || moderates(viewer);

async function toDTOs(viewer: UserDoc, docs: LostItemDoc[]): Promise<LostItemDTO[]> {
  if (!docs.length) return [];
  const claims = await LostClaim.find({ itemId: { $in: docs.map((d) => d._id) } })
    .sort({ createdAt: 1 })
    .lean<LostClaimDoc[]>();
  const [people, photos, org] = await Promise.all([
    User.find({
      _id: { $in: [...docs.map((d) => d.reporterId), ...claims.map((c) => c.userId)] },
    })
      .select('name regNo sectionId designation')
      .lean<Pick<UserDoc, '_id' | 'name' | 'regNo' | 'sectionId' | 'designation'>[]>(),
    filesByIds(docs.flatMap((d) => (d.photoId ? [d.photoId] : []))),
    getOrgLookup(),
  ]);
  const person = new Map(people.map((p) => [String(p._id), p]));
  const photo = new Map(photos.map((f) => [String(f._id), toFileDTO(f)]));
  const claimDTO = (c: LostClaimDoc): LostClaimDTO => {
    const p = person.get(String(c.userId));
    return {
      id: String(c._id),
      user: {
        id: String(c.userId),
        name: p?.name ?? 'Someone',
        detail:
          [p?.regNo, p?.sectionId ? org.sections.get(String(p.sectionId))?.name : null]
            .filter(Boolean)
            .join(' · ') ||
          p?.designation ||
          null,
      },
      message: c.message,
      createdAt: c.createdAt.toISOString(),
      accepted: c.accepted,
    };
  };
  return docs.map((doc) => {
    const own = claims.filter((c) => sameId(c.itemId, doc._id));
    const resolver = canResolve(viewer, doc);
    const mine = own.find((c) => sameId(c.userId, viewer._id));
    return {
      id: String(doc._id),
      kind: doc.kind,
      title: doc.title,
      category: doc.category,
      description: doc.description,
      place: doc.place,
      date: doc.date,
      photo: doc.photoId ? (photo.get(String(doc.photoId)) ?? null) : null,
      reporter: {
        id: String(doc.reporterId),
        name: person.get(String(doc.reporterId))?.name ?? 'Someone',
      },
      resolved: !!doc.resolvedAt,
      resolvedAt: doc.resolvedAt?.toISOString() ?? null,
      createdAt: doc.createdAt.toISOString(),
      mine: sameId(doc.reporterId, viewer._id),
      canResolve: resolver,
      claims: resolver ? own.map(claimDTO) : null,
      myClaim: mine ? claimDTO(mine) : null,
      claimCount: own.length,
    };
  });
}

async function toDTO(viewer: UserDoc, doc: LostItemDoc): Promise<LostItemDTO> {
  const [dto] = await toDTOs(viewer, [doc]);
  if (!dto) throw notFound('Item not found.');
  return dto;
}

export async function lostFoundHome(viewer: UserDoc): Promise<LostFoundHomeDTO> {
  const [items, mine, resolved] = await Promise.all([
    LostItem.find({ resolvedAt: null }).sort({ createdAt: -1 }).limit(200).lean<LostItemDoc[]>(),
    LostItem.find({ reporterId: viewer._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean<LostItemDoc[]>(),
    LostItem.find({ resolvedAt: { $ne: null } })
      .sort({ resolvedAt: -1 })
      .limit(20)
      .lean<LostItemDoc[]>(),
  ]);
  return {
    items: await toDTOs(viewer, items),
    mine: await toDTOs(viewer, mine),
    resolved: await toDTOs(viewer, resolved),
  };
}

export async function lostItemDetail(viewer: UserDoc, itemId: string): Promise<LostItemDTO> {
  const doc = await LostItem.findById(toObjectId(itemId)).lean<LostItemDoc>();
  if (!doc) throw notFound('Item not found.');
  return toDTO(viewer, doc);
}

export async function reportItem(viewer: UserDoc, input: LostItemInput): Promise<LostItemDTO> {
  const data = parse(lostItemSchema, input);
  const doc = (
    await LostItem.create({
      ...data,
      description: data.description || null,
      photoId: null,
      reporterId: viewer._id,
    })
  ).toObject<LostItemDoc>();
  if (data.photoId) {
    try {
      const [file] = await claimFiles(viewer, [data.photoId], {
        purpose: 'lostfound',
        offeringId: null,
        attachTo: doc._id,
      });
      if (file) await LostItem.updateOne({ _id: doc._id }, { $set: { photoId: file._id } });
      doc.photoId = file?._id ?? null;
    } catch (err) {
      await LostItem.deleteOne({ _id: doc._id });
      throw err;
    }
  }
  void recordAudit({
    action: 'lostfound.reported',
    actor: viewer,
    summary: `${viewer.name} reported a ${doc.kind} item: ${doc.title}`,
    targetType: 'lostitem',
    targetId: doc._id,
  });
  return toDTO(viewer, doc);
}

/** "This is mine" / "I found it": once per person per item, never on your own report. */
export async function claimItem(
  viewer: UserDoc,
  itemId: string,
  input: LostClaimInput,
): Promise<LostItemDTO> {
  const { message } = parse(lostClaimSchema, input);
  const doc = await LostItem.findById(toObjectId(itemId)).lean<LostItemDoc>();
  if (!doc) throw notFound('Item not found.');
  if (doc.resolvedAt) throw badRequest('This item has already been returned.');
  if (sameId(doc.reporterId, viewer._id)) throw badRequest('This is your own report.');
  try {
    await LostClaim.create({ itemId: doc._id, userId: viewer._id, message });
  } catch (err) {
    if (isDuplicateKeyError(err)) throw conflict('You have already answered this report.');
    throw err;
  }
  await notify([doc.reporterId], {
    type: 'campus',
    title:
      doc.kind === 'found'
        ? `${viewer.name} says the ${doc.title.toLowerCase()} is theirs`
        : `${viewer.name} may have found your ${doc.title.toLowerCase()}`,
    body: message,
    link: link(doc._id),
  });
  return toDTO(viewer, doc);
}

/** Marks an item returned (optionally to the person whose answer was right). */
export async function resolveItem(
  viewer: UserDoc,
  itemId: string,
  input: ResolveItemInput,
): Promise<LostItemDTO> {
  const { claimId } = parse(resolveItemSchema, input);
  const doc = await LostItem.findById(toObjectId(itemId)).lean<LostItemDoc>();
  if (!doc) throw notFound('Item not found.');
  if (!canResolve(viewer, doc)) {
    throw forbidden('Only the person who reported it or Student Affairs can close it.');
  }
  const claim = claimId
    ? await LostClaim.findOne({ _id: toObjectId(claimId), itemId: doc._id }).lean<LostClaimDoc>()
    : null;
  if (claimId && !claim) throw notFound('That answer is not on this report.');
  const updated = await LostItem.findOneAndUpdate(
    { _id: doc._id, resolvedAt: null },
    { $set: { resolvedAt: new Date(), resolvedById: viewer._id } },
    { returnDocument: 'after' },
  ).lean<LostItemDoc>();
  if (!updated) throw badRequest('This item has already been closed.');
  if (claim) {
    await LostClaim.updateOne({ _id: claim._id }, { $set: { accepted: true } });
    await notify([claim.userId], {
      type: 'campus',
      title:
        doc.kind === 'found'
          ? `Your ${doc.title.toLowerCase()}: marked returned to you`
          : `Thank you: ${doc.title} is back with its owner`,
      body:
        doc.kind === 'found'
          ? 'Collect it from Student Affairs (Student Service Centre) if you haven’t yet.'
          : `${viewer.name} closed the report.`,
      link: link(doc._id),
    });
  }
  // The reporter hears when Student Affairs close their report for them.
  if (!sameId(doc.reporterId, viewer._id)) {
    await notify([doc.reporterId], {
      type: 'campus',
      title: `Closed: ${doc.title}`,
      body: `${viewer.name} marked it returned.`,
      link: link(doc._id),
    });
  }
  void recordAudit({
    action: 'lostfound.resolved',
    actor: viewer,
    summary: `${viewer.name} closed the ${doc.kind} report "${doc.title}"`,
    targetType: 'lostitem',
    targetId: doc._id,
  });
  return toDTO(viewer, updated);
}

/** Removes a report made by mistake (its photo too). */
export async function deleteItem(viewer: UserDoc, itemId: string): Promise<{ ok: true }> {
  const doc = await LostItem.findById(toObjectId(itemId)).lean<LostItemDoc>();
  if (!doc) throw notFound('Item not found.');
  if (!canResolve(viewer, doc)) {
    throw forbidden('Only the person who reported it or Student Affairs can remove it.');
  }
  await Promise.all([
    LostItem.deleteOne({ _id: doc._id }),
    LostClaim.deleteMany({ itemId: doc._id }),
    doc.photoId ? deleteFiles([doc.photoId]) : Promise.resolve(),
  ]);
  return { ok: true };
}
