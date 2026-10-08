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

/**
 * Wipes every collection and leaves an empty campus: the official campus channel and one
 * IT Services admin, who then builds the real structure from the admin console.
 */
export async function setupFreshCampus(input: SetupInput): Promise<UserDoc> {
  const admin = createUserSchema.parse({ ...input, role: 'admin' });

  await Promise.all(ALL_MODELS.map((model) => model.collection.deleteMany({})));
  invalidateOrgLookup();
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

/** True when the database holds the demo campus (it was seeded and not set up fresh since). */
export async function isDemoCampus(): Promise<boolean> {
  return !!(await AuditLog.exists({ action: 'system.seeded' }));
}
