import type { AdminServerToClientEvents, GroupDTO, MessagesPage } from '@cui/shared';
import { io as connectClient, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AuditLog, Message } from '../src/models';
import {
  ACCOUNTS,
  type ClientSocket,
  clientId,
  groupByName,
  nextEvent,
  noEvent,
  startTestApp,
  type TestApp,
  userBy,
} from './helpers';

let app: TestApp;

beforeAll(async () => {
  app = await startTestApp();
});

afterEach(async () => {
  await app?.disconnectAll();
});

afterAll(async () => {
  await app?.close();
});

const send = (socket: ClientSocket, groupId: string, body: string, id = clientId()) =>
  socket.timeout(5000).emitWithAck('message:send', { groupId, body, clientId: id });

const idOf = async (name: string) => String((await groupByName(name))._id);

describe('group communication boundaries', () => {
  it('a student cannot post department notices: nobody receives it and the attempt is audited', async () => {
    const notices = await idOf('CS Department Notices');
    const hira = await app.connect(ACCOUNTS.hira);
    const ali = await app.connect(ACCOUNTS.ali);
    const silence = noEvent(ali, 'message:new', (m) => m.groupId === notices);

    const res = await send(hira, notices, 'Can we please postpone the quiz?');
    expect(res).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    if (!res.ok) expect(res.message).toMatch(/HOD/);
    expect(await silence).toBe(true);

    const audit = await AuditLog.findOne({ action: 'message.denied' }).sort({ _id: -1 }).lean();
    expect(audit?.summary).toMatch(/Hira Khan/);
    expect(audit?.summary).not.toMatch(/postpone/); // message bodies are never logged
  });

  it('the HOD posts a notice and every department member receives it instantly', async () => {
    const notices = await idOf('CS Department Notices');
    const hod = await app.connect(ACCOUNTS.hodCS);
    const hira = await app.connect(ACCOUNTS.hira);
    const usman = await app.connect(ACCOUNTS.usman);
    const danish = await app.connect(ACCOUNTS.danish); // EE student
    const forHira = nextEvent(hira, 'message:new', (m) => m.groupId === notices);
    const forUsman = nextEvent(usman, 'message:new', (m) => m.groupId === notices);
    const notForEE = noEvent(danish, 'message:new', (m) => m.groupId === notices);

    const res = await send(hod, notices, 'Mid-term date sheet is now available.');
    expect(res.ok).toBe(true);
    const received = await forHira;
    expect(received.sender).toMatchObject({ name: 'Dr. Ayesha Siddiqui', isHOD: true });
    expect((await forUsman).body).toBe('Mid-term date sheet is now available.');
    expect(await notForEE).toBe(true);
  });

  it('room isolation: a BCS-7B student never receives BCS-7A class messages', async () => {
    const classA = await idOf('BCS-7A Class');
    const ali = await app.connect(ACCOUNTS.ali);
    const hira = await app.connect(ACCOUNTS.hira);
    const usman = await app.connect(ACCOUNTS.usman);
    const forHira = nextEvent(hira, 'message:new', (m) => m.groupId === classA);
    const notForUsman = noEvent(usman, 'message:new', (m) => m.groupId === classA);

    expect((await send(ali, classA, 'Lab moved to Lab 3 tomorrow')).ok).toBe(true);
    expect((await forHira).sender.isCR).toBe(true);
    expect(await notForUsman).toBe(true);

    const usmanCookie = await app.login(ACCOUNTS.usman);
    const history = await app.api(usmanCookie, `/api/groups/${classA}/messages`);
    expect(history.status).toBe(403);
  });

  it('an instructor can make a course announcement-only (lock) and reopen it', async () => {
    const course = await idOf('Advanced Web Technologies · BCS-7A');
    const imran = await app.connect(ACCOUNTS.imran);
    const hira = await app.connect(ACCOUNTS.hira);

    const updated = nextEvent(hira, 'group:updated', (u) => u.groupId === course);
    const lock = await imran
      .timeout(5000)
      .emitWithAck('group:lock', { groupId: course, locked: true });
    expect(lock).toMatchObject({ ok: true, data: { locked: true } });
    expect((await updated).settings?.locked).toBe(true);

    const denied = await send(hira, course, 'Sir, is the viva compulsory?');
    expect(denied).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    if (!denied.ok) expect(denied.message).toMatch(/locked/i);
    expect((await send(imran, course, 'Viva schedule will be posted tonight.')).ok).toBe(true);

    await imran.timeout(5000).emitWithAck('group:lock', { groupId: course, locked: false });
    expect((await send(hira, course, 'Thank you, sir.')).ok).toBe(true);
  });

  it('members cannot moderate', async () => {
    const course = await idOf('Advanced Web Technologies · BCS-7A');
    const hira = await app.connect(ACCOUNTS.hira);
    const res = await hira
      .timeout(5000)
      .emitWithAck('group:lock', { groupId: course, locked: true });
    expect(res).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('a batch advisor can mute a member, and unmute them', async () => {
    const classA = await idOf('BCS-7A Class');
    const ahmedUser = await userBy(ACCOUNTS.ahmed);
    const imran = await app.connect(ACCOUNTS.imran);
    const ahmed = await app.connect(ACCOUNTS.ahmed);

    const notice = nextEvent(ahmed, 'member:updated', (u) => u.userId === String(ahmedUser._id));
    const mute = await imran
      .timeout(5000)
      .emitWithAck('member:mute', { groupId: classA, userId: String(ahmedUser._id), minutes: 30 });
    expect(mute.ok).toBe(true);
    expect((await notice).mutedUntil).toBeTruthy();

    const denied = await send(ahmed, classA, 'Why was I muted?');
    expect(denied).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    if (!denied.ok) expect(denied.message).toMatch(/muted/i);

    await imran
      .timeout(5000)
      .emitWithAck('member:mute', { groupId: classA, userId: String(ahmedUser._id), minutes: 0 });
    expect((await send(ahmed, classA, 'Sorry about earlier.')).ok).toBe(true);
  });
});

describe('live membership changes', () => {
  it('an added member joins the room instantly; a removed member stops receiving immediately', async () => {
    const acm = await idOf('ACM CUI Chapter');
    const mehwishUser = await userBy(ACCOUNTS.mehwish);
    const adminCookie = await app.login(ACCOUNTS.admin);
    const mehwish = await app.connect(ACCOUNTS.mehwish);
    const danish = await app.connect(ACCOUNTS.danish);

    const added = nextEvent(mehwish, 'group:added', (g: GroupDTO) => g.id === acm);
    const addRes = await app.api(adminCookie, `/api/groups/${acm}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId: String(mehwishUser._id) }),
    });
    expect(addRes.status).toBe(201);
    expect((await added).myRole).toBe('member');

    const delivered = nextEvent(mehwish, 'message:new', (m) => m.groupId === acm);
    expect((await send(danish, acm, 'Welcome to ACM, Mehwish!')).ok).toBe(true);
    expect((await delivered).body).toMatch(/Welcome/);

    const removed = nextEvent(mehwish, 'group:removed', (p) => p.groupId === acm);
    const delRes = await app.api(adminCookie, `/api/groups/${acm}/members/${mehwishUser._id}`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(200);
    await removed;
    const silence = noEvent(mehwish, 'message:new', (m) => m.groupId === acm);
    expect((await send(danish, acm, 'Contest rules are now posted.')).ok).toBe(true);
    expect(await silence).toBe(true);
  });

  it('students can join open societies but not invite-only groups', async () => {
    const sports = await idOf('CUI Sports Society');
    const fyp = await idOf('CS FYP Committee');
    const mehwish = await app.connect(ACCOUNTS.mehwish);
    const joined = await mehwish.timeout(5000).emitWithAck('group:join', { groupId: sports });
    expect(joined).toMatchObject({ ok: true, data: { id: sports, myRole: 'member' } });
    const refused = await mehwish.timeout(5000).emitWithAck('group:join', { groupId: fyp });
    expect(refused).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('direct-message boundaries', () => {
  const sana = 'sana.javed@comsats.edu.pk';
  const naveed = 'naveed.anwar@comsats.edu.pk';

  it('enforces who may start a conversation with whom', async () => {
    const hira = await app.connect(ACCOUNTS.hira);
    const shahzaib = await app.connect('FA23-BEE-003');
    const exam = await app.connect(ACCOUNTS.exam);
    const open = (socket: ClientSocket, identifier: string) =>
      userBy(identifier).then((u) =>
        socket.timeout(5000).emitWithAck('dm:open', { userId: String(u._id) }),
      );

    expect(await open(hira, sana)).toMatchObject({ ok: false, code: 'FORBIDDEN' }); // not her teacher
    expect(await open(hira, naveed)).toMatchObject({ ok: true }); // teaches her Compiler Construction
    expect(await open(hira, ACCOUNTS.admin)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await open(shahzaib, ACCOUNTS.hira)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await open(exam, ACCOUNTS.hira)).toMatchObject({ ok: true }); // offices reach anyone
    expect(await open(hira, ACCOUNTS.exam)).toMatchObject({ ok: true });
  });

  it('the directory only lists people you are allowed to message', async () => {
    const cookie = await app.login(ACCOUNTS.hira);
    const people: { name: string }[] = await (await app.api(cookie, '/api/directory')).json();
    const names = people.map((p) => p.name);
    expect(names).toContain('Dr. Naveed Anwar');
    expect(names).toContain('Sadia Rehman');
    expect(names).not.toContain('Dr. Sana Javed');
    expect(names).not.toContain('IT Services Admin');
  });

  it('a student may reply to a conversation an admin started (reply rule)', async () => {
    const hiraUser = await userBy(ACCOUNTS.hira);
    const admin = await app.connect(ACCOUNTS.admin);
    const hira = await app.connect(ACCOUNTS.hira);
    const thread = await admin
      .timeout(5000)
      .emitWithAck('dm:open', { userId: String(hiraUser._id) });
    expect(thread.ok).toBe(true);
    if (!thread.ok) return;

    const surfaced = nextEvent(hira, 'group:added', (g) => g.id === thread.data.id);
    expect((await send(admin, thread.data.id, 'Your portal password has been reset.')).ok).toBe(
      true,
    );
    expect((await surfaced).peer?.name).toBe('IT Services Admin');
    expect((await send(hira, thread.data.id, 'Thank you!')).ok).toBe(true);
  });

  it('admins cannot read private conversations', async () => {
    const adminCookie = await app.login(ACCOUNTS.admin);
    const imran = await userBy(ACCOUNTS.imran);
    const dm = await Message.findOne({ senderId: imran._id, body: /FYP proposal/ }).lean();
    expect(dm).toBeTruthy();
    const res = await app.api(adminCookie, `/api/groups/${dm?.groupId}/messages`);
    expect(res.status).toBe(403);
    const groups: { type: string }[] = await (
      await app.api(adminCookie, '/api/admin/groups')
    ).json();
    expect(groups.some((g) => g.type === 'DIRECT')).toBe(false);
  });

  it('DM partners see read receipts ("Seen")', async () => {
    const imran = await app.connect(ACCOUNTS.imran);
    const hira = await app.connect(ACCOUNTS.hira);
    const imranUser = await userBy(ACCOUNTS.imran);
    const hiraUser = await userBy(ACCOUNTS.hira);
    const dm = await Message.findOne({ senderId: imranUser._id, body: /FYP proposal/ }).lean();
    const groupId = String(dm?.groupId);
    const sent = await send(imran, groupId, 'Bring your proposal draft as well.');
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    const seen = nextEvent(imran, 'read:update', (r) => r.userId === String(hiraUser._id));
    const ack = await hira
      .timeout(5000)
      .emitWithAck('message:read', { groupId, messageId: sent.data.id });
    expect(ack.ok).toBe(true);
    expect((await seen).messageId).toBe(sent.data.id);
  });
});

describe('robustness', () => {
  it('rate-limits bursts of messages', async () => {
    const classA = await idOf('BCS-7A Class');
    const zainab = await app.connect('FA23-BCS-004');
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => send(zainab, classA, `spam ${i}`)),
    );
    expect(results.some((r) => !r.ok && r.code === 'RATE_LIMITED')).toBe(true);
    expect(results.some((r) => r.ok)).toBe(true);
  });

  it('validates every socket payload', async () => {
    const classA = await idOf('BCS-7A Class');
    const hassan = await app.connect('FA23-BCS-005');
    expect(await send(hassan, classA, '   ')).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await send(hassan, 'not-an-id', 'hi')).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(await send(hassan, classA, 'x'.repeat(4001))).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
  });

  it('retrying with the same clientId stores the message once', async () => {
    const classA = await idOf('BCS-7A Class');
    const maryam = await app.connect('FA23-BCS-006');
    const id = clientId();
    const first = await send(maryam, classA, 'Shared the notes on the group drive', id);
    const retry = await send(maryam, classA, 'Shared the notes on the group drive', id);
    expect(first.ok && retry.ok).toBe(true);
    if (first.ok && retry.ok) expect(retry.data.id).toBe(first.data.id);
    expect(await Message.countDocuments({ clientId: id })).toBe(1);
  });

  it('typing indicators reach other members only', async () => {
    const classA = await idOf('BCS-7A Class');
    const ali = await app.connect(ACCOUNTS.ali);
    const hira = await app.connect(ACCOUNTS.hira);
    const usman = await app.connect(ACCOUNTS.usman);
    const typing = nextEvent(hira, 'typing', (t) => t.groupId === classA);
    const notUsman = noEvent(usman, 'typing', (t) => t.groupId === classA);
    ali.emit('typing:start', { groupId: classA });
    expect(await typing).toMatchObject({ name: 'Ali Raza', typing: true });
    expect(await notUsman).toBe(true);
  });

  it('presence: classmates see you come online and go offline; unrelated users do not', async () => {
    // BSE-5A classmates; Shahzaib (EE) shares no conversation group with them.
    const saadUser = await userBy('FA24-BSE-003');
    const iqra = await app.connect('FA24-BSE-002');
    const shahzaib = await app.connect('FA23-BEE-003');
    const online = nextEvent(iqra, 'presence:update', (p) => p.userId === String(saadUser._id));
    const notEE = noEvent(shahzaib, 'presence:update', (p) => p.userId === String(saadUser._id));
    const saad = await app.connect('FA24-BSE-003');
    expect((await online).online).toBe(true);
    expect(await notEE).toBe(true);

    const list = await iqra.timeout(5000).emitWithAck('presence:list');
    expect(list.ok && list.data.includes(String(saadUser._id))).toBe(true);

    const offline = nextEvent(
      iqra,
      'presence:update',
      (p) => p.userId === String(saadUser._id) && !p.online,
    );
    saad.disconnect();
    expect((await offline).online).toBe(false);
  });

  it('authors can delete within 15 minutes; other members cannot', async () => {
    const classA = await idOf('BCS-7A Class');
    const ali = await app.connect(ACCOUNTS.ali);
    const hira = await app.connect(ACCOUNTS.hira);
    const sent = await send(ali, classA, 'Wrong room number, ignore this');
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    const notAllowed = await hira
      .timeout(5000)
      .emitWithAck('message:delete', { messageId: sent.data.id });
    expect(notAllowed).toMatchObject({ ok: false, code: 'FORBIDDEN' });

    const gone = nextEvent(hira, 'message:deleted', (d) => d.messageId === sent.data.id);
    const ok = await ali.timeout(5000).emitWithAck('message:delete', { messageId: sent.data.id });
    expect(ok.ok).toBe(true);
    await gone;

    const cookie = await app.login(ACCOUNTS.hira);
    const page: MessagesPage = await (
      await app.api(cookie, `/api/groups/${classA}/messages?limit=100`)
    ).json();
    const deleted = page.messages.find((m) => m.id === sent.data.id);
    expect(deleted).toMatchObject({ deleted: true, body: '' });
  });

  it('paginates history with a cursor', async () => {
    const course = await idOf('Advanced Web Technologies · BCS-7A');
    const cookie = await app.login(ACCOUNTS.hira);
    const first: MessagesPage = await (
      await app.api(cookie, `/api/groups/${course}/messages?limit=2`)
    ).json();
    expect(first.messages).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    const older: MessagesPage = await (
      await app.api(
        cookie,
        `/api/groups/${course}/messages?limit=2&before=${first.messages[0]?.id}`,
      )
    ).json();
    expect(older.messages).toHaveLength(2);
    expect((older.messages[1]?.id ?? '') < (first.messages[0]?.id ?? '')).toBe(true);
  });
});

describe('sessions and the admin namespace', () => {
  const connectAdminNs = (cookie: string) =>
    new Promise<Socket<AdminServerToClientEvents>>((resolve, reject) => {
      const socket: Socket<AdminServerToClientEvents> = connectClient(`${app.url}/admin`, {
        transports: ['websocket'],
        extraHeaders: { cookie },
        forceNew: true,
        reconnection: false,
      });
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });

  it('only admins may join /admin, which streams stats and audit entries live', async () => {
    const studentCookie = await app.login(ACCOUNTS.hira);
    await expect(connectAdminNs(studentCookie)).rejects.toThrow(/FORBIDDEN/);

    const adminCookie = await app.login(ACCOUNTS.admin);
    const adminNs = await connectAdminNs(adminCookie);
    const stats = await new Promise((resolve) => adminNs.once('stats', resolve));
    expect(stats).toHaveProperty('onlineUsers');

    const audit = new Promise<{ action: string }>((resolve) => adminNs.once('audit:new', resolve));
    const hira = await app.connect(ACCOUNTS.hira);
    await send(hira, await idOf('CUI Islamabad Official'), 'Is tomorrow a holiday?');
    expect((await audit).action).toBe('message.denied');
    adminNs.disconnect();
  });

  it('rejects connections without a valid session', async () => {
    await expect(app.connectWithCookie('cui_session=forged')).rejects.toThrow(/UNAUTHENTICATED/);
  });

  it('deactivating a user disconnects their live sockets and their cookie stops working', async () => {
    const adminCookie = await app.login(ACCOUNTS.admin);
    const cookie = await app.login('FA23-BCS-005');
    const hassan = await app.connectWithCookie(cookie);
    const hassanUser = await userBy('FA23-BCS-005');

    const revoked = nextEvent(hassan, 'session:revoked');
    const disconnected = new Promise((resolve) => hassan.once('disconnect', resolve));
    await app.api(adminCookie, `/api/admin/users/${hassanUser._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: false }),
    });
    expect((await revoked).reason).toMatch(/deactivated/);
    await disconnected;
    await expect(app.connectWithCookie(cookie)).rejects.toThrow(/UNAUTHENTICATED/);
  });
});
