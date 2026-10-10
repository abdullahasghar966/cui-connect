import {
  type CreateUserInput,
  type CsvImportResultDTO,
  createUserSchema,
  type UpdateUserInput,
} from '@cui/shared';
import type { Types } from 'mongoose';
import { hashPassword } from '../auth/password';
import { parseCsv } from '../lib/csv';
import { badRequest, conflict, isDuplicateKeyError, notFound } from '../lib/errors';
import { Department, Section, type SectionDoc, User, type UserDoc } from '../models';
import { revokeUserSessions } from '../realtime/notifier';
import { recordAudit } from './audit';
import { toObjectId } from './mappers';
import { reconcileUser, reconcileUsers } from './provisioning';

type Actor = UserDoc | null;

/** Readable names for changed fields in audit entries. */
const FIELD_LABELS: Record<string, string> = {
  departmentId: 'department',
  sectionId: 'section',
  isHOD: 'HOD',
  isCR: 'CR',
};

/** Students inherit their department from their section; references must exist. */
async function resolveOrg(input: {
  role: UserDoc['role'];
  departmentId?: string | null;
  sectionId?: string | null;
}): Promise<{ departmentId: Types.ObjectId | null; sectionId: Types.ObjectId | null }> {
  let section: SectionDoc | null = null;
  if (input.sectionId) {
    if (input.role !== 'student') throw badRequest('Only students can belong to a section.');
    section = await Section.findById(input.sectionId).lean<SectionDoc>();
    if (!section) throw badRequest('sectionId: section not found');
  }
  let departmentId = input.departmentId ? toObjectId(input.departmentId) : null;
  if (section) {
    if (departmentId && String(departmentId) !== String(section.departmentId)) {
      throw badRequest("departmentId: does not match the section's department");
    }
    departmentId = section.departmentId;
  }
  if (departmentId && !(await Department.exists({ _id: departmentId }))) {
    throw badRequest('departmentId: department not found');
  }
  return { departmentId, sectionId: section?._id ?? null };
}

/** A department has one HOD: appointing a new one demotes the previous HOD. */
async function demoteOtherHODs(departmentId: Types.ObjectId | null, keepId: Types.ObjectId) {
  if (!departmentId) return [];
  const previous = await User.find({ departmentId, isHOD: true, _id: { $ne: keepId } })
    .select('_id')
    .lean();
  if (previous.length) {
    await User.updateMany({ _id: { $in: previous.map((p) => p._id) } }, { $set: { isHOD: false } });
  }
  return previous.map((p) => p._id);
}

export async function createUser(
  actor: Actor,
  input: CreateUserInput,
  options: { passwordHash?: string; notify?: boolean } = {},
): Promise<UserDoc> {
  const org = await resolveOrg(input);
  let doc: UserDoc;
  try {
    const created = await User.create({
      name: input.name,
      email: input.email,
      passwordHash: options.passwordHash ?? (await hashPassword(input.password)),
      role: input.role,
      regNo: input.role === 'student' ? (input.regNo ?? null) : null,
      designation: input.designation ?? null,
      office: input.role === 'staff' ? (input.office ?? null) : null,
      departmentId: org.departmentId,
      sectionId: org.sectionId,
      isHOD: input.role === 'faculty' && !!input.isHOD,
      isCR: input.role === 'student' && !!input.isCR,
    });
    doc = created.toObject<UserDoc>();
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw conflict('A user with this email or registration number already exists.');
    }
    throw err;
  }

  const notify = options.notify ?? true;
  if (doc.isHOD) await reconcileUsers(await demoteOtherHODs(doc.departmentId, doc._id), { notify });
  await reconcileUser(doc._id, { notify });
  void recordAudit({
    action: 'user.created',
    actor,
    summary: `${actor?.name ?? 'System'} created ${doc.role} account for ${doc.name}`,
    targetType: 'user',
    targetId: doc._id,
  });
  return doc;
}

export async function updateUser(
  actor: Actor,
  userId: string,
  input: UpdateUserInput,
): Promise<UserDoc> {
  const user = await User.findById(userId).lean<UserDoc>();
  if (!user) throw notFound('User not found.');
  if (input.isHOD && user.role !== 'faculty') throw badRequest('Only faculty can be HOD.');
  if (input.isCR && user.role !== 'student') throw badRequest('Only students can be CR.');
  if (actor && String(actor._id) === userId && input.active === false) {
    throw badRequest("You can't deactivate your own account.");
  }

  const set: Record<string, unknown> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.email !== undefined) set.email = input.email;
  if (input.designation !== undefined) set.designation = input.designation;
  if (input.office !== undefined && user.role === 'staff') set.office = input.office;
  if (input.isHOD !== undefined) set.isHOD = input.isHOD;
  if (input.isCR !== undefined) set.isCR = input.isCR;
  if (input.active !== undefined) set.active = input.active;
  if (input.sectionId !== undefined || input.departmentId !== undefined) {
    const org = await resolveOrg({
      role: user.role,
      departmentId:
        input.departmentId !== undefined ? input.departmentId : user.departmentId?.toString(),
      sectionId: input.sectionId !== undefined ? input.sectionId : user.sectionId?.toString(),
    });
    set.departmentId = org.departmentId;
    set.sectionId = org.sectionId;
  }
  if (input.password) set.passwordHash = await hashPassword(input.password);

  const revoke = !!input.password || (input.active === false && user.active);
  try {
    await User.updateOne(
      { _id: user._id },
      { $set: set, ...(revoke ? { $inc: { tokenVersion: 1 } } : {}) },
    );
  } catch (err) {
    if (isDuplicateKeyError(err)) throw conflict('Another user already has this email.');
    throw err;
  }

  if (input.active === false && user.active) {
    revokeUserSessions(userId, 'Your account has been deactivated by IT Services.');
  } else if (input.password) {
    revokeUserSessions(userId, 'Your password was changed. Please sign in again.');
  }

  const updated = await User.findById(userId).lean<UserDoc>();
  if (!updated) throw notFound('User not found.');
  if (input.isHOD) await reconcileUsers(await demoteOtherHODs(updated.departmentId, updated._id));
  await reconcileUser(updated._id);

  const actorName = actor?.name ?? 'System';
  const deactivated = input.active === false && user.active;
  const reactivated = input.active === true && !user.active;
  const changes = [
    ...new Set(
      Object.keys(set)
        .filter((k) => k !== 'passwordHash' && k !== 'active')
        .map((k) => FIELD_LABELS[k] ?? k),
    ),
  ];
  if (input.password) changes.push('password');
  void recordAudit({
    action: deactivated ? 'user.deactivated' : reactivated ? 'user.reactivated' : 'user.updated',
    actor,
    severity: deactivated ? 'warning' : 'info',
    summary: deactivated
      ? `${actorName} deactivated ${updated.name}`
      : reactivated
        ? `${actorName} reactivated ${updated.name}`
        : `${actorName} updated ${updated.name} (${changes.join(', ') || 'no changes'})`,
    targetType: 'user',
    targetId: updated._id,
  });
  return updated;
}

export const CSV_COLUMNS = [
  'name',
  'email',
  'role',
  'department',
  'section',
  'regNo',
  'designation',
  'office',
  'isCR',
  'isHOD',
  'password',
] as const;

/**
 * Bulk account provisioning, e.g. registering a whole new section at the start of term.
 * `department` is a department code (CS) and `section` a section name (BCS-7A).
 */
export async function importUsersCsv(
  actor: Actor,
  csv: string,
  defaultPassword: string | undefined,
): Promise<CsvImportResultDTO> {
  const rows = parseCsv(csv);
  const header = rows.shift()?.map((h) => h.trim());
  if (!header?.includes('name') || !header.includes('email') || !header.includes('role')) {
    throw badRequest('The first row must be a header with at least: name,email,role');
  }
  const col = (row: string[], name: string) => {
    const index = header.indexOf(name);
    return index >= 0 ? (row[index] ?? '').trim() : '';
  };

  const [departments, sections] = await Promise.all([
    Department.find().lean(),
    Section.find().lean(),
  ]);
  const deptByCode = new Map(departments.map((d) => [d.code, String(d._id)]));
  const sectionByName = new Map(sections.map((s) => [s.name, String(s._id)]));
  const defaultHash = defaultPassword ? await hashPassword(defaultPassword) : undefined;

  const result: CsvImportResultDTO = { created: 0, errors: [] };
  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const deptCode = col(row, 'department').toUpperCase();
    const sectionName = col(row, 'section').toUpperCase();
    if (deptCode && !deptByCode.has(deptCode)) {
      result.errors.push({ line, message: `Unknown department "${deptCode}"` });
      continue;
    }
    if (sectionName && !sectionByName.has(sectionName)) {
      result.errors.push({ line, message: `Unknown section "${sectionName}"` });
      continue;
    }
    const password = col(row, 'password') || defaultPassword;
    const parsed = createUserSchema.safeParse({
      name: col(row, 'name'),
      email: col(row, 'email'),
      role: col(row, 'role').toLowerCase(),
      departmentId: deptCode ? deptByCode.get(deptCode) : null,
      sectionId: sectionName ? sectionByName.get(sectionName) : null,
      regNo: col(row, 'regNo') || null,
      designation: col(row, 'designation') || null,
      office: col(row, 'office').toUpperCase() || null,
      isCR: /^(true|yes|1)$/i.test(col(row, 'isCR')),
      isHOD: /^(true|yes|1)$/i.test(col(row, 'isHOD')),
      password,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      result.errors.push({
        line,
        message: `${issue?.path.join('.') || 'row'}: ${issue?.message ?? 'invalid'}`,
      });
      continue;
    }
    try {
      await createUser(actor, parsed.data, {
        passwordHash: col(row, 'password') ? undefined : defaultHash,
      });
      result.created++;
    } catch (err) {
      result.errors.push({ line, message: err instanceof Error ? err.message : 'Failed' });
    }
  }

  void recordAudit({
    action: 'user.imported',
    actor,
    summary: `${actor?.name ?? 'System'} imported ${result.created} account(s) from CSV (${result.errors.length} error(s))`,
  });
  return result;
}
