/**
 * One search box for the whole app (Ctrl+K): courses, teachers, rooms, and messages. Messages
 * come only from chats the reader may read, by the same rule that guards the chat itself.
 */
import { canRead, type MessageHitDTO, type SearchResultsDTO } from '@cui/shared';
import { escapeRegex } from '../lib/text';
import {
  CatalogCourse,
  type CatalogCourseDoc,
  Group,
  type GroupDoc,
  Membership,
  type MembershipDoc,
  Message,
  type MessageDoc,
  Room,
  type RoomDoc,
  User,
  type UserDoc,
} from '../models';
import { getOrgLookup, toPolicyGroup, toPolicyMembership, toPolicyUser } from './mappers';

const LIMIT = 6;
const SNIPPET = 140;

/** Chats the user may read: their memberships, filtered by the communication policy. */
export async function readableGroups(user: UserDoc): Promise<Map<string, GroupDoc>> {
  const memberships = await Membership.find({ userId: user._id }).lean<MembershipDoc[]>();
  const groups = await Group.find({ _id: { $in: memberships.map((m) => m.groupId) } }).lean<
    GroupDoc[]
  >();
  const byGroup = new Map(memberships.map((m) => [String(m.groupId), m]));
  const self = toPolicyUser(user);
  return new Map(
    groups
      .filter(
        (g) =>
          canRead(self, toPolicyGroup(g), toPolicyMembership(byGroup.get(String(g._id)))).allowed,
      )
      .map((g) => [String(g._id), g]),
  );
}

/** About 140 characters around the first matching word. */
function snippetOf(body: string, q: string): string {
  const lower = body.toLowerCase();
  const hits = q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => lower.indexOf(w))
    .filter((i) => i >= 0);
  const start = hits.length ? Math.max(0, Math.min(...hits) - 50) : 0;
  const text = body
    .slice(start, start + SNIPPET)
    .replace(/\s+/g, ' ')
    .trim();
  return `${start > 0 ? '…' : ''}${text}${start + SNIPPET < body.length ? '…' : ''}`;
}

/** For DMs, show the other person's name instead of "Direct message". */
async function directNames(
  user: UserDoc,
  messages: MessageDoc[],
  groups: Map<string, GroupDoc>,
): Promise<Map<string, string>> {
  const dmIds = [...new Set(messages.map((m) => String(m.groupId)))].filter(
    (id) => groups.get(id)?.type === 'DIRECT',
  );
  if (!dmIds.length) return new Map();
  const others = await Membership.find({
    groupId: { $in: dmIds },
    userId: { $ne: user._id },
  }).lean<MembershipDoc[]>();
  const people = await User.find({ _id: { $in: others.map((o) => o.userId) } })
    .select('name')
    .lean<Pick<UserDoc, '_id' | 'name'>[]>();
  const nameOf = new Map(people.map((p) => [String(p._id), p.name]));
  return new Map(
    others.map((o) => [String(o.groupId), nameOf.get(String(o.userId)) ?? 'Direct message']),
  );
}

export async function searchMessages(
  user: UserDoc,
  q: string,
  limit = 20,
): Promise<MessageHitDTO[]> {
  const groups = await readableGroups(user);
  const base = { groupId: { $in: [...groups.values()].map((g) => g._id) }, deletedAt: null };
  // Whole words first (ranked by the text index), then words that merely start with the query.
  const ranked = await Message.find(
    { ...base, $text: { $search: q } },
    { score: { $meta: 'textScore' } },
  )
    .sort({ score: { $meta: 'textScore' }, _id: -1 })
    .limit(limit)
    .lean<MessageDoc[]>();
  let found = ranked;
  if (found.length < limit) {
    const prefix = await Message.find({
      ...base,
      _id: { $nin: found.map((m) => m._id) },
      body: new RegExp(`\\b${escapeRegex(q)}`, 'i'),
    })
      .sort({ _id: -1 })
      .limit(limit - found.length)
      .lean<MessageDoc[]>();
    found = [...found, ...prefix];
  }
  const senders = await User.find({ _id: { $in: found.map((m) => m.senderId) } })
    .select('name')
    .lean<Pick<UserDoc, '_id' | 'name'>[]>();
  const nameOf = new Map(senders.map((s) => [String(s._id), s.name]));
  const peerNames = await directNames(user, found, groups);
  return found.map((m) => {
    const group = groups.get(String(m.groupId));
    return {
      id: String(m._id),
      groupId: String(m.groupId),
      groupName:
        group?.type === 'DIRECT'
          ? (peerNames.get(String(m.groupId)) ?? 'Direct message')
          : (group?.name ?? 'Chat'),
      sender: nameOf.get(String(m.senderId)) ?? 'Someone',
      snippet: snippetOf(m.body, q),
      createdAt: m.createdAt.toISOString(),
    };
  });
}

export async function searchEverything(user: UserDoc, q: string): Promise<SearchResultsDTO> {
  const rx = new RegExp(escapeRegex(q), 'i');
  const [courses, teachers, rooms, messages, org] = await Promise.all([
    CatalogCourse.find({ $or: [{ code: rx }, { title: rx }] })
      .sort({ code: 1 })
      .limit(LIMIT)
      .lean<CatalogCourseDoc[]>(),
    User.find({ role: 'faculty', active: true, name: rx })
      .sort({ name: 1 })
      .limit(LIMIT)
      .lean<UserDoc[]>(),
    Room.find({ $or: [{ name: rx }, { block: rx }] })
      .sort({ name: 1 })
      .limit(LIMIT)
      .lean<RoomDoc[]>(),
    searchMessages(user, q, LIMIT),
    getOrgLookup(),
  ]);
  const deptCode = (id: unknown) => (id ? (org.departments.get(String(id))?.code ?? null) : null);
  return {
    courses: courses.map((c) => ({
      code: c.code,
      title: c.title,
      departmentCode: deptCode(c.departmentId),
    })),
    teachers: teachers.map((t) => ({
      id: String(t._id),
      name: t.name,
      designation: t.designation,
      departmentCode: deptCode(t.departmentId),
    })),
    rooms: rooms.map((r) => ({ id: String(r._id), name: r.name, block: r.block })),
    messages,
  };
}
