import {
  addMemberSchema,
  canBeMember,
  canManageMembers,
  canRead,
  directoryQuerySchema,
  historyQuerySchema,
  objectIdSchema,
  updateGroupSchema,
  updateMemberSchema,
} from '@cui/shared';
import { type Request, Router } from 'express';
import { currentUser } from '../../auth/middleware';
import { forbidden, notFound, parse } from '../../lib/errors';
import { Group, type GroupDoc, Membership, type MembershipDoc } from '../../models';
import { listDirectory } from '../../services/direct';
import {
  buildGroupDTO,
  buildGroupDTOs,
  countMembers,
  listMembers,
  toAdminGroupDTO,
} from '../../services/groups';
import { toPolicyGroup, toPolicyMembership, toPolicyUser } from '../../services/mappers';
import { listMessages } from '../../services/messages';
import { addMember, removeMember, setMemberRole, updateGroup } from '../../services/moderation';

export const apiRouter = Router();

const param = (req: Request, name: string) => parse(objectIdSchema, req.params[name]);

apiRouter.get('/groups', async (req, res) => {
  res.json(await buildGroupDTOs(currentUser(req)._id));
});

/** Open groups (societies) the viewer is eligible to join. */
apiRouter.get('/groups/discover', async (req, res) => {
  const me = currentUser(req);
  const mine = await Membership.find({ userId: me._id }).distinct('groupId');
  const open = await Group.find({ 'settings.joinPolicy': 'open', _id: { $nin: mine } })
    .sort({ name: 1 })
    .lean<GroupDoc[]>();
  const eligible = open.filter((g) => canBeMember(toPolicyUser(me), toPolicyGroup(g)).allowed);
  const counts = await countMembers(eligible.map((g) => g._id));
  res.json(eligible.map((g) => toAdminGroupDTO(g, counts.get(String(g._id)) ?? 0)));
});

apiRouter.get('/groups/:groupId', async (req, res) => {
  const dto = await buildGroupDTO(currentUser(req)._id, param(req, 'groupId'));
  if (!dto) throw notFound('Group not found or you are not a member.');
  res.json(dto);
});

apiRouter.patch('/groups/:groupId', async (req, res) => {
  await updateGroup(currentUser(req), param(req, 'groupId'), parse(updateGroupSchema, req.body));
  res.json({ ok: true });
});

apiRouter.get('/groups/:groupId/members', async (req, res) => {
  const me = currentUser(req);
  const groupId = param(req, 'groupId');
  const [group, membership] = await Promise.all([
    Group.findById(groupId).lean<GroupDoc>(),
    Membership.findOne({ groupId, userId: me._id }).lean<MembershipDoc>(),
  ]);
  if (!group) throw notFound('Group not found.');
  const user = toPolicyUser(me);
  const policyGroup = toPolicyGroup(group);
  const policyMembership = toPolicyMembership(membership);
  const read = canRead(user, policyGroup, policyMembership);
  if (!read.allowed && !canManageMembers(user, policyGroup, policyMembership).allowed) {
    throw forbidden(read.reason);
  }
  res.json(await listMembers(groupId));
});

apiRouter.post('/groups/:groupId/members', async (req, res) => {
  const input = parse(addMemberSchema, req.body);
  res.status(201).json(await addMember(currentUser(req), param(req, 'groupId'), input));
});

apiRouter.patch('/groups/:groupId/members/:userId', async (req, res) => {
  const { role } = parse(updateMemberSchema, req.body);
  await setMemberRole(currentUser(req), param(req, 'groupId'), param(req, 'userId'), role);
  res.json({ ok: true });
});

apiRouter.delete('/groups/:groupId/members/:userId', async (req, res) => {
  await removeMember(currentUser(req), param(req, 'groupId'), param(req, 'userId'));
  res.json({ ok: true });
});

apiRouter.get('/groups/:groupId/messages', async (req, res) => {
  const query = parse(historyQuerySchema, req.query);
  res.json(await listMessages(currentUser(req), param(req, 'groupId'), query));
});

/** People the viewer may start a direct message with. */
apiRouter.get('/directory', async (req, res) => {
  const { q } = parse(directoryQuerySchema, req.query);
  res.json(await listDirectory(currentUser(req), q));
});
