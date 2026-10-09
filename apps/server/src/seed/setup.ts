import { createUserSchema } from '@cui/shared';
import { hashPassword } from '../auth/password';
import { ALL_MODELS, AuditLog, User, type UserDoc } from '../models';
import { recordAudit } from '../services/audit';
import { invalidateOrgLookup } from '../services/mappers';
import { ensureCampusGroup, reconcileUser } from '../services/provisioning';

export interface SetupInput {
  name: string;
  email: string;
  password: string;
}

const parseAdmin = (input: SetupInput) => createUserSchema.parse({ ...input, role: 'admin' });

/**
 * Creates the official campus channel and the first IT Services admin, who then builds the real
 * structure from the admin console. Used by the first-run setup page and `npm run setup`.
 */
export async function createFirstAdmin(input: SetupInput): Promise<UserDoc> {
  const admin = parseAdmin(input);
  await ensureCampusGroup();
  const user = (
    await User.create({
      name: admin.name,
      email: admin.email,
      passwordHash: await hashPassword(admin.password),
      role: 'admin',
      designation: 'System Administrator, IT Services',
    })
  ).toObject<UserDoc>();
  await reconcileUser(user._id, { notify: false });
  await recordAudit({
    action: 'system.setup',
    actor: null,
    summary: `Fresh campus set up with administrator ${user.name}`,
  });
  return user;
}

/** `npm run setup`: wipes every collection, then creates the first admin. */
export async function setupFreshCampus(input: SetupInput): Promise<UserDoc> {
  parseAdmin(input); // validate before deleting anything
  await Promise.all(ALL_MODELS.map((model) => model.collection.deleteMany({})));
  invalidateOrgLookup();
  return createFirstAdmin(input);
}

/** True while nobody can sign in yet: the first-run setup page is shown. */
export async function needsFirstAdmin(): Promise<boolean> {
  return !(await User.exists({}));
}

/** True when the database holds the demo campus (it was seeded and not set up fresh since). */
export async function isDemoCampus(): Promise<boolean> {
  return !!(await AuditLog.exists({ action: 'system.seeded' }));
}
