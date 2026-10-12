import type { MessageDTO, MessagesPage, SendMessageInput } from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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
  await app.disconnectAll();
});

afterAll(async () => {
  await app?.close();
});

const AWT = 'Advanced Web Technologies · BCS-7A';
const SECTION = 'BCS-7A Class';

const idOf = async (name: string) => String((await groupByName(name))._id);

const send = async (
  socket: ClientSocket,
  input: Omit<SendMessageInput, 'clientId'>,
): Promise<MessageDTO> => {
  const res = await socket
    .timeout(5000)
    .emitWithAck('message:send', { ...input, clientId: clientId() });
  if (!res.ok) throw new Error(`${res.code}: ${res.message}`);
  return res.data;
};

const history = async (cookie: string, groupId: string): Promise<MessageDTO[]> => {
  const page: MessagesPage = await (
    await app.api(cookie, `/api/groups/${groupId}/messages?limit=50`)
  ).json();
  return page.messages;
};

describe('replies', () => {
  it('quote the message they answer, and stop quoting it once it is deleted', async () => {
    const section = await idOf(SECTION);
    const ali = await app.connect(ACCOUNTS.ali);
    const hira = await app.connect(ACCOUNTS.hira);
    const question = await send(ali, { groupId: section, body: 'Is the AWT quiz on Friday?' });
    const reply = await send(hira, {
      groupId: section,
      body: 'Yes, at 10.',
      replyToId: question.id,
    });
    expect(reply.replyTo).toEqual({
      id: question.id,
      senderName: 'Ali Raza',
      snippet: 'Is the AWT quiz on Friday?',
      deleted: false,
    });

    // A message from another chat can't be quoted.
    const lounge = await idOf(AWT);
    const elsewhere = await ali.timeout(5000).emitWithAck('message:send', {
      groupId: lounge,
      body: 'Cross-posted reply',
      clientId: clientId(),
      replyToId: question.id,
    });
    expect(elsewhere).toMatchObject({ ok: false, code: 'VALIDATION' });

    await ali.timeout(5000).emitWithAck('message:delete', { messageId: question.id });
    const hiraCookie = await app.login(ACCOUNTS.hira);
    const after = (await history(hiraCookie, section)).find((m) => m.id === reply.id);
    expect(after?.replyTo).toMatchObject({ id: question.id, deleted: true, snippet: '' });
  });
});

describe('mentions', () => {
  it('notify the members named with @, and nobody else', async () => {
    const awt = await idOf(AWT);
    const [hira, usman] = await Promise.all([userBy(ACCOUNTS.hira), userBy(ACCOUNTS.usman)]);
    const imran = await app.connect(ACCOUNTS.imran);
    const hiraSocket = await app.connect(ACCOUNTS.hira);
    const aliSocket = await app.connect(ACCOUNTS.ali);
    const told = nextEvent(hiraSocket, 'notification:new', (n) => n.type === 'mentions');
    const quiet = noEvent(aliSocket, 'notification:new', (n) => n.type === 'mentions');

    const message = await send(imran, {
      groupId: awt,
      body: '@Hira Khan please share your rooms demo with the class.',
      // Usman isn't in this course; Ali is listed but not named in the text.
      mentionIds: [String(hira._id), String(usman._id), String((await userBy(ACCOUNTS.ali))._id)],
    });
    expect(message.mentions).toEqual([{ id: String(hira._id), name: 'Hira Khan' }]);
    const notice = await told;
    expect(notice.title).toBe(`Dr. Imran Haider mentioned you in ${AWT}`);
    expect(notice.link).toBe(`/chat/${awt}?message=${message.id}`);
    expect(await quiet).toBe(true);
  });
});

describe('reactions', () => {
  it('toggle per person and update live for the chat', async () => {
    const section = await idOf(SECTION);
    const ali = await app.connect(ACCOUNTS.ali);
    const hira = await app.connect(ACCOUNTS.hira);
    const message = await send(ali, { groupId: section, body: 'Notes for Monday are up.' });

    const seen = nextEvent(ali, 'message:updated', (e) => e.messageId === message.id);
    const added = await hira
      .timeout(5000)
      .emitWithAck('message:react', { messageId: message.id, emoji: '🙏' });
    const hiraUser = await userBy(ACCOUNTS.hira);
    expect(added).toEqual({ ok: true, data: [{ emoji: '🙏', userIds: [String(hiraUser._id)] }] });
    expect((await seen).reactions).toEqual([{ emoji: '🙏', userIds: [String(hiraUser._id)] }]);

    const removed = await hira
      .timeout(5000)
      .emitWithAck('message:react', { messageId: message.id, emoji: '🙏' });
    expect(removed).toEqual({ ok: true, data: [] });

    const bad = await hira
      .timeout(5000)
      .emitWithAck('message:react', { messageId: message.id, emoji: '💩' as '👍' });
    expect(bad).toMatchObject({ ok: false, code: 'VALIDATION' });
    const usman = await app.connect(ACCOUNTS.usman);
    const outsider = await usman
      .timeout(5000)
      .emitWithAck('message:react', { messageId: message.id, emoji: '👍' });
    expect(outsider).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('pins', () => {
  it('moderators pin in groups; the chat sees it and can list pins', async () => {
    const awt = await idOf(AWT);
    const imran = await app.connect(ACCOUNTS.imran);
    const ali = await app.connect(ACCOUNTS.ali);
    const notice = await send(imran, {
      groupId: awt,
      body: 'Assignment 2 is due Friday 11:59 PM.',
    });

    const refused = await ali
      .timeout(5000)
      .emitWithAck('message:pin', { messageId: notice.id, pinned: true });
    expect(refused).toMatchObject({ ok: false, code: 'FORBIDDEN' });

    const live = nextEvent(ali, 'message:updated', (e) => e.messageId === notice.id && !!e.pinned);
    const pinned = await imran
      .timeout(5000)
      .emitWithAck('message:pin', { messageId: notice.id, pinned: true });
    expect(pinned).toMatchObject({ ok: true, data: { byName: 'Dr. Imran Haider' } });
    await live;
    const aliCookie = await app.login(ACCOUNTS.ali);
    const pins: MessageDTO[] = await (await app.api(aliCookie, `/api/groups/${awt}/pins`)).json();
    expect(pins.map((m) => m.id)).toContain(notice.id);

    await imran.timeout(5000).emitWithAck('message:pin', { messageId: notice.id, pinned: false });
    const after: MessageDTO[] = await (await app.api(aliCookie, `/api/groups/${awt}/pins`)).json();
    expect(after.map((m) => m.id)).not.toContain(notice.id);
  });
});

describe('anonymous questions', () => {
  it("hide the student's name from everyone but them, and stay moderated", async () => {
    const awt = await idOf(AWT);
    const hiraUser = await userBy(ACCOUNTS.hira);
    const hira = await app.connect(ACCOUNTS.hira);
    const ali = await app.connect(ACCOUNTS.ali);
    const imran = await app.connect(ACCOUNTS.imran);

    const broadcast = nextEvent(ali, 'message:new', (m) => m.anonymous);
    const mine = await send(hira, {
      groupId: awt,
      body: 'Could you explain acknowledgements again?',
      anonymous: true,
    });
    // The author's own copy names her; the room's copy carries no trace of her.
    expect(mine).toMatchObject({ anonymous: true, sender: { id: String(hiraUser._id) } });
    const seen = await broadcast;
    expect(seen.sender).toMatchObject({ id: 'anonymous', name: 'Anonymous student' });
    expect(JSON.stringify(seen)).not.toContain(String(hiraUser._id));

    const [aliCookie, hiraCookie, imranCookie] = await Promise.all([
      app.login(ACCOUNTS.ali),
      app.login(ACCOUNTS.hira),
      app.login(ACCOUNTS.imran),
    ]);
    const asTeacher = (await history(imranCookie, awt)).find((m) => m.id === mine.id);
    expect(asTeacher?.sender.name).toBe('Anonymous student');
    expect((await history(hiraCookie, awt)).find((m) => m.id === mine.id)?.sender.name).toBe(
      'Hira Khan',
    );
    const found = await (
      await app.api(aliCookie, '/api/search/messages?q=acknowledgements%20again')
    ).json();
    expect(found.find((h: { id: string }) => h.id === mine.id)?.sender).toBe('Anonymous student');

    // Only students, only in course chats; teachers still moderate.
    const section = await idOf(SECTION);
    const outside = await hira.timeout(5000).emitWithAck('message:send', {
      groupId: section,
      body: 'Anonymous in the section?',
      clientId: clientId(),
      anonymous: true,
    });
    expect(outside).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    const teacher = await imran.timeout(5000).emitWithAck('message:send', {
      groupId: awt,
      body: 'Teachers cannot hide',
      clientId: clientId(),
      anonymous: true,
    });
    expect(teacher).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    const removed = await imran.timeout(5000).emitWithAck('message:delete', { messageId: mine.id });
    expect(removed).toMatchObject({ ok: true });
  });
});
