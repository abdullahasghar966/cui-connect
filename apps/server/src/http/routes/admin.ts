import {
  type AdminOverviewDTO,
  createCourseSchema,
  createDepartmentSchema,
  createGroupSchema,
  createSectionSchema,
  createTermSchema,
  createUserSchema,
  csvImportSchema,
  defaultGroupSettings,
  enrollSchema,
  GROUP_TYPES,
  objectIdSchema,
  ROLES,
  type Role,
  updateSectionSchema,
  updateUserSchema,
  userListQuerySchema,
} from '@cui/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';
import { currentUser } from '../../auth/middleware';
import { parse } from '../../lib/errors';
import { escapeRegex } from '../../lib/text';
import {
  AuditLog,
  type AuditLogDoc,
  CatalogCourse,
  Group,
  type GroupDoc,
  Message,
  Program,
  Room,
  User,
  type UserDoc,
} from '../../models';
import { onlineUserIds } from '../../realtime/presence';
import { recordAudit } from '../../services/audit';
import { countMembers, toAdminGroupDTO } from '../../services/groups';
import { getOrgLookup, toAuditDTO, toUserDTO } from '../../services/mappers';
import { addMember } from '../../services/moderation';
import { deleteRoom, saveRoom } from '../../services/rooms';
import {
  createCourse,
  createDepartment,
  createSection,
  enrollStudents,
  listCourseStudents,
  listCourses,
  listDepartments,
  listSections,
  setBatchAdvisor,
  unenrollStudent,
} from '../../services/structure';
import { createTerm, currentTerm, setCurrentTerm } from '../../services/terms';
import { createUser, importUsersCsv, updateUser } from '../../services/users';

export const adminRouter = Router();

const param = (req: Request, name: string) => parse(objectIdSchema, req.params[name]);

adminRouter.get('/overview', async (_req, res) => {
  const [userCounts, groupCounts, messages] = await Promise.all([
    User.aggregate<{ _id: Role; n: number }>([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
    Group.aggregate<{ _id: GroupDoc['type']; n: number }>([
      { $group: { _id: '$type', n: { $sum: 1 } } },
    ]),
    Message.countDocuments(),
  ]);
  const users = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
  for (const row of userCounts) users[row._id] = row.n;
  const [term, rooms, catalog, programs] = await Promise.all([
    currentTerm(),
    Room.countDocuments(),
    CatalogCourse.countDocuments(),
    Program.countDocuments(),
  ]);
  const overview: AdminOverviewDTO = {
    users,
    groups: Object.fromEntries(groupCounts.map((g) => [g._id, g.n])),
    messages,
    online: onlineUserIds().length,
    academics: { currentTerm: term.name, rooms, catalog, programs },
  };
  res.json(overview);
});

// ---- Campus setup: terms and rooms ----

adminRouter.post('/terms', async (req, res) => {
  res.status(201).json(await createTerm(currentUser(req), parse(createTermSchema, req.body)));
});

adminRouter.post('/terms/:termId/current', async (req, res) => {
  res.json(await setCurrentTerm(currentUser(req), param(req, 'termId')));
});

adminRouter.post('/rooms', async (req, res) => {
  res.status(201).json(await saveRoom(currentUser(req), null, req.body));
});

adminRouter.put('/rooms/:roomId', async (req, res) => {
  res.json(await saveRoom(currentUser(req), param(req, 'roomId'), req.body));
});

adminRouter.delete('/rooms/:roomId', async (req, res) => {
  await deleteRoom(currentUser(req), param(req, 'roomId'));
  res.json({ ok: true });
});

// ---- Structure ----

adminRouter.get('/departments', async (_req, res) => {
  res.json(await listDepartments());
});

adminRouter.post('/departments', async (req, res) => {
  const dept = await createDepartment(currentUser(req), parse(createDepartmentSchema, req.body));
  res.status(201).json({ id: String(dept._id) });
});

adminRouter.get('/sections', async (_req, res) => {
  res.json(await listSections());
});

adminRouter.post('/sections', async (req, res) => {
  const section = await createSection(currentUser(req), parse(createSectionSchema, req.body));
  res.status(201).json({ id: String(section._id) });
});

adminRouter.patch('/sections/:sectionId', async (req, res) => {
  const { batchAdvisorId } = parse(updateSectionSchema, req.body);
  await setBatchAdvisor(currentUser(req), param(req, 'sectionId'), batchAdvisorId);
  res.json({ ok: true });
});

adminRouter.get('/courses', async (_req, res) => {
  res.json(await listCourses());
});

adminRouter.post('/courses', async (req, res) => {
  const course = await createCourse(currentUser(req), parse(createCourseSchema, req.body));
  res.status(201).json({ id: String(course._id) });
});

adminRouter.get('/courses/:courseId/students', async (req, res) => {
  res.json(await listCourseStudents(param(req, 'courseId')));
});

adminRouter.post('/courses/:courseId/enroll', async (req, res) => {
  const { studentIds } = parse(enrollSchema, req.body);
  await enrollStudents(currentUser(req), param(req, 'courseId'), studentIds);
  res.json({ ok: true });
});

adminRouter.delete('/courses/:courseId/students/:studentId', async (req, res) => {
  await unenrollStudent(currentUser(req), param(req, 'courseId'), param(req, 'studentId'));
  res.json({ ok: true });
});

// ---- Users ----

adminRouter.get('/users', async (req, res) => {
  const { q, role } = parse(userListQuerySchema, req.query);
  const filter: Record<string, unknown> = {};
  if (role) filter.role = role;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { regNo: rx }];
  }
  const [users, org] = await Promise.all([
    User.find(filter).sort({ role: 1, name: 1 }).limit(500).lean<UserDoc[]>(),
    getOrgLookup(),
  ]);
  res.json(users.map((u) => toUserDTO(u, org)));
});

adminRouter.post('/users', async (req, res) => {
  const user = await createUser(currentUser(req), parse(createUserSchema, req.body));
  res.status(201).json(toUserDTO(user, await getOrgLookup()));
});

adminRouter.patch('/users/:userId', async (req, res) => {
  const user = await updateUser(
    currentUser(req),
    param(req, 'userId'),
    parse(updateUserSchema, req.body),
  );
  res.json(toUserDTO(user, await getOrgLookup()));
});

adminRouter.post('/users/import', async (req, res) => {
  const { csv, defaultPassword } = parse(csvImportSchema, req.body);
  res.json(await importUsersCsv(currentUser(req), csv, defaultPassword));
});

// ---- Groups ----

const groupListQuery = z.object({ type: z.enum(GROUP_TYPES).optional() });

adminRouter.get('/groups', async (req, res) => {
  const { type } = parse(groupListQuery, req.query);
  // Admins manage structure, not private conversations: DMs are never listed.
  const groups = await Group.find(type ? { type } : { type: { $ne: 'DIRECT' } })
    .sort({ type: 1, name: 1 })
    .lean<GroupDoc[]>();
  const visible = groups.filter((g) => g.type !== 'DIRECT');
  const counts = await countMembers(visible.map((g) => g._id));
  res.json(visible.map((g) => toAdminGroupDTO(g, counts.get(String(g._id)) ?? 0)));
});

adminRouter.post('/groups', async (req, res) => {
  const actor = currentUser(req);
  const input = parse(createGroupSchema, req.body);
  const settings = { ...defaultGroupSettings(input.type), ...input.settings, locked: false };
  const created = await Group.create({
    name: input.name,
    description: input.description ?? null,
    type: input.type,
    system: false,
    settings,
    createdById: actor._id,
  });
  const groupId = String(created._id);
  void recordAudit({
    action: 'group.created',
    actor,
    summary: `${actor.name} created ${input.type === 'SOCIETY' ? 'society' : 'group'} "${input.name}"`,
    targetType: 'group',
    targetId: groupId,
  });
  const failures: string[] = [];
  for (const userId of input.memberIds ?? []) {
    try {
      await addMember(actor, groupId, { userId, role: 'member' });
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }
  res.status(201).json({ id: groupId, failures });
});

// ---- Audit ----

const auditQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) });

adminRouter.get('/audit', async (req, res) => {
  const { limit } = parse(auditQuery, req.query);
  const logs = await AuditLog.find().sort({ _id: -1 }).limit(limit).lean<AuditLogDoc[]>();
  const actors = await User.find({ _id: { $in: logs.map((l) => l.actorId).filter(Boolean) } })
    .select('name role')
    .lean<Pick<UserDoc, '_id' | 'name' | 'role'>[]>();
  const actorById = new Map(actors.map((a) => [String(a._id), a]));
  res.json(logs.map((l) => toAuditDTO(l, l.actorId ? actorById.get(String(l.actorId)) : null)));
});
