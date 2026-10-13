/**
 * The jobs and internships board. Student Affairs (and IT) post roles with a deadline and a way to
 * apply (a web link or an email); students of the programmes a post is for are told about it.
 * Anyone can save a post, and hears about its deadline two days before. Posts hide after their
 * deadline or when closed early.
 */
import {
  addDays,
  campusClock,
  canManageStudentAffairs,
  formatShortDate,
  JOB_DEADLINE_REMINDER_DAYS,
  JOB_KIND_LABELS,
  type JobDTO,
  type JobInput,
  type JobsHomeDTO,
  jobSchema,
} from '@cui/shared';
import { assertAllowed, badRequest, notFound, parse } from '../lib/errors';
import { JobPost, type JobPostDoc, SavedJob, Section, User, type UserDoc } from '../models';
import { recordAudit } from './audit';
import { toObjectId, toPolicyUser } from './mappers';
import { notify } from './notifications';

const isClosed = (doc: JobPostDoc, today: string) => !!doc.closedAt || doc.deadline < today;

async function toDTOs(viewer: UserDoc, docs: JobPostDoc[]): Promise<JobDTO[]> {
  if (!docs.length) return [];
  const [posters, saved] = await Promise.all([
    User.find({ _id: { $in: docs.map((d) => d.postedById) } })
      .select('name')
      .lean<Pick<UserDoc, '_id' | 'name'>[]>(),
    SavedJob.find({ userId: viewer._id, jobId: { $in: docs.map((d) => d._id) } }).distinct('jobId'),
  ]);
  const name = new Map(posters.map((p) => [String(p._id), p.name]));
  const savedIds = new Set(saved.map(String));
  const today = campusClock().date;
  return docs.map((doc) => ({
    id: String(doc._id),
    title: doc.title,
    company: doc.company,
    kind: doc.kind,
    location: doc.location,
    description: doc.description,
    applyUrl: doc.applyUrl,
    applyEmail: doc.applyEmail,
    deadline: doc.deadline,
    programs: doc.programs,
    postedBy: {
      id: String(doc.postedById),
      name: name.get(String(doc.postedById)) ?? 'Student Affairs',
    },
    postedAt: doc.createdAt.toISOString(),
    closed: isClosed(doc, today),
    saved: savedIds.has(String(doc._id)),
  }));
}

const manages = (viewer: UserDoc) => canManageStudentAffairs(toPolicyUser(viewer)).allowed;

export async function jobsHome(viewer: UserDoc): Promise<JobsHomeDTO> {
  const today = campusClock().date;
  const canManage = manages(viewer);
  const savedIds = await SavedJob.find({ userId: viewer._id }).distinct('jobId');
  const [open, saved, closed] = await Promise.all([
    JobPost.find({ closedAt: null, deadline: { $gte: today } })
      .sort({ deadline: 1 })
      .limit(200)
      .lean<JobPostDoc[]>(),
    JobPost.find({ _id: { $in: savedIds } })
      .sort({ deadline: 1 })
      .lean<JobPostDoc[]>(),
    canManage
      ? JobPost.find({ $or: [{ closedAt: { $ne: null } }, { deadline: { $lt: today } }] })
          .sort({ deadline: -1 })
          .limit(50)
          .lean<JobPostDoc[]>()
      : Promise.resolve([]),
  ]);
  return {
    open: await toDTOs(viewer, open),
    saved: await toDTOs(viewer, saved),
    closed: await toDTOs(viewer, closed),
    canManage,
  };
}

/** Students of the programmes a post is for (none named: nobody is notified). */
async function studentsOf(programs: string[]) {
  if (!programs.length) return [];
  const sections = await Section.find({ program: { $in: programs } }).distinct('_id');
  return User.find({ role: 'student', active: true, sectionId: { $in: sections } }).distinct('_id');
}

export async function saveJob(actor: UserDoc, input: JobInput, jobId?: string): Promise<JobDTO> {
  assertAllowed(canManageStudentAffairs(toPolicyUser(actor)));
  const data = parse(jobSchema, input);
  if (!jobId && data.deadline < campusClock().date) {
    throw badRequest('The deadline has already passed.');
  }
  const fields = {
    ...data,
    applyUrl: data.applyUrl || null,
    applyEmail: data.applyEmail || null,
  };
  const doc = jobId
    ? await JobPost.findByIdAndUpdate(
        toObjectId(jobId),
        { $set: fields },
        {
          returnDocument: 'after',
        },
      ).lean<JobPostDoc>()
    : (await JobPost.create({ ...fields, postedById: actor._id })).toObject<JobPostDoc>();
  if (!doc) throw notFound('Job not found.');
  if (!jobId) {
    await notify(await studentsOf(doc.programs), {
      type: 'campus',
      title: `New ${JOB_KIND_LABELS[doc.kind].toLowerCase()}: ${doc.title} at ${doc.company}`,
      body: `Apply by ${formatShortDate(doc.deadline)}.`,
      link: '/campus/jobs',
    });
  }
  void recordAudit({
    action: jobId ? 'job.updated' : 'job.posted',
    actor,
    summary: `${actor.name} ${jobId ? 'updated' : 'posted'} "${doc.title}" at ${doc.company}`,
    targetType: 'job',
    targetId: doc._id,
  });
  const [dto] = await toDTOs(actor, [doc]);
  if (!dto) throw notFound('Job not found.');
  return dto;
}

export async function closeJob(actor: UserDoc, jobId: string): Promise<JobDTO> {
  assertAllowed(canManageStudentAffairs(toPolicyUser(actor)));
  const doc = await JobPost.findByIdAndUpdate(
    toObjectId(jobId),
    { $set: { closedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean<JobPostDoc>();
  if (!doc) throw notFound('Job not found.');
  const [dto] = await toDTOs(actor, [doc]);
  if (!dto) throw notFound('Job not found.');
  return dto;
}

/** Bookmarks a post (or removes the bookmark). */
export async function toggleSavedJob(
  viewer: UserDoc,
  jobId: string,
  saved: boolean,
): Promise<JobDTO> {
  const doc = await JobPost.findById(toObjectId(jobId)).lean<JobPostDoc>();
  if (!doc) throw notFound('Job not found.');
  if (saved) {
    await SavedJob.updateOne(
      { userId: viewer._id, jobId: doc._id },
      { $setOnInsert: { userId: viewer._id, jobId: doc._id } },
      { upsert: true },
    );
  } else {
    await SavedJob.deleteOne({ userId: viewer._id, jobId: doc._id });
  }
  const [dto] = await toDTOs(viewer, [doc]);
  if (!dto) throw notFound('Job not found.');
  return dto;
}

/** People who saved an open post, a couple of days before its deadline. */
export async function jobDeadlineReminders(today: string): Promise<number> {
  const due = addDays(today, JOB_DEADLINE_REMINDER_DAYS);
  const jobs = await JobPost.find({ deadline: due, closedAt: null }).lean<JobPostDoc[]>();
  let sent = 0;
  for (const job of jobs) {
    const savers = await SavedJob.find({ jobId: job._id }).distinct('userId');
    sent += await notify(savers, {
      type: 'campus',
      title: `Apply by ${formatShortDate(job.deadline)}: ${job.title}`,
      body: `${job.company} · the deadline is in ${JOB_DEADLINE_REMINDER_DAYS} days.`,
      link: '/campus/jobs?tab=saved',
      key: `remind:job:${job._id}:${job.deadline}`,
    });
  }
  return sent;
}
