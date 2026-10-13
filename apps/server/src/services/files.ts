/**
 * Uploaded files. The bytes go into MongoDB GridFS (bucket `files`) in the same database, so no
 * other storage account is needed; a StoredFile record says who owns each file, which course it
 * belongs to and what it's attached to. That decides who may download it:
 * - a file not attached yet: only the person who uploaded it;
 * - a submission: the student, and whoever may see the class's records (instructor, HOD, Exam
 *   Office, IT);
 * - course material or an assignment's handout: everyone in the course;
 * - a lost & found photo or a profile photo (images only, no course): everyone signed in, once
 *   it is on a report or someone's profile.
 */
import type { Readable } from 'node:stream';
import {
  canStudyIn,
  canViewOfferingRecords,
  cleanFileName,
  FILE_QUOTA_BYTES,
  type FileDTO,
  type FilePurpose,
  fileTypeFor,
  formatBytes,
  MAX_FILE_BYTES,
} from '@cui/shared';
import mongoose, { Types } from 'mongoose';
import { AppError, assertAllowed, badRequest, notFound } from '../lib/errors';
import { logger } from '../lib/logger';
import { StoredFile, type StoredFileDoc, type UserDoc } from '../models';
import { sameId, toObjectId, toPolicyUser } from './mappers';
import { loadOffering, manageDecision, type OfferingContext } from './offering-context';
import { offeringFacts } from './timetable';

const PENDING_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** Images that belong to no course and that everyone signed in may see once attached. */
const PHOTO_PURPOSES: readonly FilePurpose[] = ['lostfound', 'avatar'];

function bucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('The database is not connected.');
  return new mongoose.mongo.GridFSBucket(db, { bucketName: 'files' });
}

export function toFileDTO(file: StoredFileDoc): FileDTO {
  return {
    id: String(file._id),
    name: file.name,
    size: file.size,
    type: file.type,
    url: `/api/files/${file._id}`,
    uploadedAt: file.createdAt.toISOString(),
  };
}

/** Files by id, in the order given (missing ones skipped). */
export async function filesByIds(ids: readonly Types.ObjectId[]): Promise<StoredFileDoc[]> {
  if (!ids.length) return [];
  const files = await StoredFile.find({ _id: { $in: ids } }).lean<StoredFileDoc[]>();
  const byId = new Map(files.map((f) => [String(f._id), f]));
  return ids.map((id) => byId.get(String(id))).filter((f): f is StoredFileDoc => !!f);
}

/** Who may upload for this purpose: students hand in work; the course's teacher posts the rest. */
function assertMayUpload(user: UserDoc, ctx: OfferingContext, purpose: FilePurpose) {
  if (purpose === 'submission') {
    assertAllowed(canStudyIn(toPolicyUser(user), offeringFacts(ctx.offering, ctx.section)));
  } else {
    assertAllowed(manageDecision(user, ctx));
  }
}

export interface UploadRequest {
  /** As sent by the browser (URI-encoded). */
  name: string;
  purpose: FilePurpose;
  /** Required for course files; none for lost & found photos. */
  offeringId?: string | null;
}

export async function uploadFile(
  user: UserDoc,
  request: UploadRequest,
  body: Buffer,
): Promise<FileDTO> {
  // Photos (lost & found, profile) belong to no course; anyone signed in may add one.
  const photo = PHOTO_PURPOSES.includes(request.purpose);
  let offeringId: Types.ObjectId | null = null;
  if (!photo) {
    if (!request.offeringId) throw badRequest('Say which course the file is for.');
    const ctx = await loadOffering(request.offeringId);
    assertMayUpload(user, ctx, request.purpose);
    offeringId = ctx.offering._id;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(request.name);
  } catch {
    throw badRequest('The file name is not valid.');
  }
  const name = cleanFileName(decoded);
  const type = fileTypeFor(name);
  if (!name || !type) {
    throw badRequest(
      'This kind of file cannot be uploaded. Use PDF, Word, PowerPoint, Excel, text, code, images or ZIP.',
    );
  }
  if (photo && !type.inline) {
    throw badRequest('Add a photo (JPG, PNG, GIF or WebP).');
  }
  if (!body.length) throw badRequest('The file is empty.');
  if (body.length > MAX_FILE_BYTES) {
    throw new AppError(413, 'VALIDATION', `Files can be at most ${formatBytes(MAX_FILE_BYTES)}.`);
  }
  const [used] = await StoredFile.aggregate<{ total: number }>([
    { $match: { ownerId: user._id } },
    { $group: { _id: null, total: { $sum: '$size' } } },
  ]);
  if ((used?.total ?? 0) + body.length > FILE_QUOTA_BYTES) {
    throw badRequest(
      `You have used your ${formatBytes(FILE_QUOTA_BYTES)} of file storage. Remove old files first.`,
    );
  }

  const file = await storeFile({
    name,
    body,
    ownerId: user._id,
    purpose: request.purpose,
    offeringId,
    attachedTo: null,
  });
  return toFileDTO(file);
}

/** Writes the bytes to GridFS and records the file (no checks: callers have done them). */
export async function storeFile(input: {
  name: string;
  body: Buffer;
  ownerId: Types.ObjectId;
  purpose: FilePurpose;
  offeringId: Types.ObjectId | null;
  attachedTo: Types.ObjectId | null;
  createdAt?: Date;
}): Promise<StoredFileDoc> {
  const id = new Types.ObjectId();
  await new Promise<void>((resolve, reject) => {
    const stream = bucket().openUploadStreamWithId(id, input.name);
    stream.once('finish', () => resolve());
    stream.once('error', reject);
    stream.end(input.body);
  });
  const { body, ...rest } = input;
  return (
    await StoredFile.create({
      ...rest,
      _id: id,
      size: body.length,
      type: fileTypeFor(input.name)?.mime ?? 'application/octet-stream',
    })
  ).toObject<StoredFileDoc>();
}

/** Empties the file store (seeding and starting a fresh campus). */
export async function clearStoredFiles(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  await Promise.all([
    StoredFile.collection.deleteMany({}),
    db.collection('files.files').deleteMany({}),
    db.collection('files.chunks').deleteMany({}),
  ]);
}

/**
 * Attaches uploaded files to what they were uploaded for. Each must belong to the person, be for
 * this purpose and course, and be either new or already attached to this same item.
 */
export async function claimFiles(
  user: UserDoc,
  ids: readonly string[],
  target: { purpose: FilePurpose; offeringId: Types.ObjectId | null; attachTo: Types.ObjectId },
): Promise<StoredFileDoc[]> {
  const unique = [...new Set(ids)].map((id) => toObjectId(id));
  const files = await filesByIds(unique);
  const usable = files.filter(
    (f) =>
      sameId(f.ownerId, user._id) &&
      f.purpose === target.purpose &&
      (target.offeringId ? sameId(f.offeringId, target.offeringId) : !f.offeringId) &&
      (!f.attachedTo || sameId(f.attachedTo, target.attachTo)),
  );
  if (usable.length !== unique.length) {
    throw badRequest('A file could not be found. Upload it again.');
  }
  if (unique.length) {
    await StoredFile.updateMany(
      { _id: { $in: unique } },
      { $set: { attachedTo: target.attachTo } },
    );
  }
  return usable.map((f) => ({ ...f, attachedTo: target.attachTo }));
}

/** Removes files and their bytes (missing ones are ignored). */
export async function deleteFiles(ids: readonly Types.ObjectId[]): Promise<void> {
  if (!ids.length) return;
  await StoredFile.deleteMany({ _id: { $in: ids } });
  const gridfs = bucket();
  await Promise.all(
    ids.map((id) =>
      gridfs.delete(id).catch((err: unknown) => {
        if ((err as { message?: string }).message?.includes('File not found')) return;
        logger.warn({ err, fileId: String(id) }, 'Could not delete a stored file');
      }),
    ),
  );
}

/** Files attached to an item that are no longer in its list. */
export async function releaseFiles(
  attachedTo: Types.ObjectId,
  keep: readonly Types.ObjectId[],
): Promise<void> {
  const stale = await StoredFile.find({
    attachedTo,
    _id: { $nin: keep },
  }).distinct('_id');
  await deleteFiles(stale);
}

async function mayDownload(user: UserDoc, file: StoredFileDoc): Promise<boolean> {
  if (sameId(file.ownerId, user._id)) return true;
  if (!file.attachedTo) return false;
  // A lost & found photo, or someone's profile photo, is for everyone signed in.
  if (PHOTO_PURPOSES.includes(file.purpose)) return true;
  if (!file.offeringId) return false;
  const ctx = await loadOffering(String(file.offeringId));
  const facts = offeringFacts(ctx.offering, ctx.section);
  const policyUser = toPolicyUser(user);
  if (canViewOfferingRecords(policyUser, facts).allowed) return true;
  // Course material and handouts are for the whole class; submissions are private.
  return file.purpose !== 'submission' && canStudyIn(policyUser, facts).allowed;
}

/** The file and a stream of its bytes, if this person may download it (404 otherwise). */
export async function openFile(
  user: UserDoc,
  fileId: string,
): Promise<{ file: StoredFileDoc; inline: boolean; stream: Readable }> {
  const file = await StoredFile.findById(toObjectId(fileId)).lean<StoredFileDoc>();
  if (!file || !(await mayDownload(user, file))) throw notFound('File not found.');
  return {
    file,
    inline: fileTypeFor(file.name)?.inline ?? false,
    stream: bucket().openDownloadStream(file._id),
  };
}

/** Deletes a file you uploaded that isn't attached to anything yet. */
export async function discardFile(user: UserDoc, fileId: string): Promise<void> {
  const file = await StoredFile.findById(toObjectId(fileId)).lean<StoredFileDoc>();
  if (!file || !sameId(file.ownerId, user._id)) throw notFound('File not found.');
  if (file.attachedTo) throw badRequest('This file is in use. Remove it where it is attached.');
  await deleteFiles([file._id]);
}

/** Removes uploads that were never attached (an abandoned form) after a day. */
export async function sweepOrphanFiles(now = new Date()): Promise<number> {
  const stale = await StoredFile.find({
    attachedTo: null,
    createdAt: { $lt: new Date(now.getTime() - PENDING_LIFETIME_MS) },
  }).distinct('_id');
  await deleteFiles(stale);
  return stale.length;
}

/** Sweeps abandoned uploads every hour; returns a function that stops it. */
export function startFileSweeper(): () => void {
  const timer = setInterval(
    () => {
      sweepOrphanFiles().catch((err) => logger.error({ err }, 'File clean-up failed'));
    },
    60 * 60 * 1000,
  );
  timer.unref();
  return () => clearInterval(timer);
}

/** RFC 6266 header value that keeps non-ASCII names intact. */
export function contentDisposition(name: string, inline: boolean): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
