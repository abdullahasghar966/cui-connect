import type { MessageDTO, PollDTO } from '@cui/shared';
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
const idOf = async (name: string) => String((await groupByName(name))._id);

const startPoll = (
  socket: ClientSocket,
  groupId: string,
  question: string,
  options: string[],
  multiple = false,
) =>
  socket.timeout(5000).emitWithAck('message:send', {
    groupId,
    body: question,
    clientId: clientId(),
    poll: { question, options, multiple },
  });

const vote = (socket: ClientSocket, messageId: string, optionIds: string[]) =>
  socket.timeout(5000).emitWithAck('poll:vote', { messageId, optionIds });

const count = (poll: PollDTO, id: string) =>
  poll.options.find((o) => o.id === id)?.voterIds.length ?? 0;

describe('polls in chats', () => {
  it('starts a poll that members see and vote on live; outsiders see nothing', async () => {
    const group = await idOf(AWT);
    const imran = await app.connect(ACCOUNTS.imran);
    const hira = await app.connect(ACCOUNTS.hira);
    const usman = await app.connect(ACCOUNTS.usman);
    const hiraUser = await userBy(ACCOUNTS.hira);

    const arrives = nextEvent(hira, 'message:new', (m) => m.kind === 'poll');
    const outside = noEvent(usman, 'message:new');
    const created = await startPoll(imran, group, 'When should the viva be?', [
      'Monday',
      'Tuesday',
      'Wednesday',
    ]);
    expect(created.ok).toBe(true);
    const message = (created as { data: MessageDTO }).data;
    expect(message.poll?.options.map((o) => o.id)).toEqual(['o1', 'o2', 'o3']);
    expect((await arrives).poll?.question).toBe('When should the viva be?');
    expect(await outside).toBe(true);

    const update = nextEvent(imran, 'poll:updated', (e) => e.messageId === message.id);
    const voted = await vote(hira, message.id, ['o2']);
    expect(voted.ok).toBe(true);
    const live = (await update).poll;
    expect(count(live, 'o2')).toBe(1);
    expect(live.options.find((o) => o.id === 'o2')?.voterIds).toEqual([String(hiraUser._id)]);
    expect(live.voters).toBe(1);

    // Changing a single-choice vote moves it; two picks are refused; empty withdraws.
    const moved = (await vote(hira, message.id, ['o3'])) as { ok: true; data: PollDTO };
    expect([count(moved.data, 'o2'), count(moved.data, 'o3')]).toEqual([0, 1]);
    const two = await vote(hira, message.id, ['o1', 'o2']);
    expect(two).toMatchObject({ ok: false, code: 'VALIDATION' });
    const unknown = await vote(hira, message.id, ['o9']);
    expect(unknown).toMatchObject({ ok: false, code: 'VALIDATION' });
    const withdrawn = (await vote(hira, message.id, [])) as { ok: true; data: PollDTO };
    expect(withdrawn.data.voters).toBe(0);

    // Someone who can't read the chat can't vote either.
    const intruder = await vote(usman, message.id, ['o1']);
    expect(intruder).toMatchObject({ ok: false, code: 'FORBIDDEN' });

    // History carries the votes.
    expect((await vote(hira, message.id, ['o1'])).ok).toBe(true);
    const cookie = await app.login(ACCOUNTS.ali);
    const page = await (await app.api(cookie, `/api/groups/${group}/messages`)).json();
    const stored = page.messages.find((m: MessageDTO) => m.id === message.id);
    expect(count(stored.poll, 'o1')).toBe(1);
  });

  it('lets several answers count once per voter, and only the author or a moderator close it', async () => {
    const group = await idOf(AWT);
    const imran = await app.connect(ACCOUNTS.imran);
    const hira = await app.connect(ACCOUNTS.hira);
    const ali = await app.connect(ACCOUNTS.ali);
    const created = (await startPoll(
      hira,
      group,
      'Which topics should the review cover?',
      ['Rooms', 'Namespaces', 'Acknowledgements'],
      true,
    )) as { ok: true; data: MessageDTO };
    const id = created.data.id;
    const picks = (await vote(ali, id, ['o1', 'o3'])) as { ok: true; data: PollDTO };
    expect(picks.data.voters).toBe(1);
    expect([count(picks.data, 'o1'), count(picks.data, 'o3')]).toEqual([1, 1]);

    const refused = await ali.timeout(5000).emitWithAck('poll:close', { messageId: id });
    expect(refused).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    // The teacher owns the course chat, so they may close a student's poll.
    const closed = (await imran.timeout(5000).emitWithAck('poll:close', { messageId: id })) as {
      ok: true;
      data: PollDTO;
    };
    expect(closed.data.closedAt).not.toBeNull();
    const late = await vote(hira, id, ['o2']);
    expect(late).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('follows the posting rules to start a poll, and the reading rules to vote', async () => {
    const notices = await idOf('CUI Islamabad Official');
    const director = await app.connect(ACCOUNTS.director);
    const hira = await app.connect(ACCOUNTS.hira);
    const denied = await startPoll(hira, notices, 'Can students post polls here?', ['Yes', 'No']);
    expect(denied).toMatchObject({ ok: false, code: 'FORBIDDEN' });

    const official = (await startPoll(director, notices, 'Preferred convocation date?', [
      '12 Dec',
      '19 Dec',
    ])) as { ok: true; data: MessageDTO };
    expect(official.ok).toBe(true);
    // Read-only announcement channel, but everyone may answer the poll.
    expect((await vote(hira, official.data.id, ['o2'])).ok).toBe(true);

    const tooFew = await startPoll(director, notices, 'Only one option?', ['Yes']);
    expect(tooFew).toMatchObject({ ok: false, code: 'VALIDATION' });
    const duplicate = await startPoll(director, notices, 'Same twice?', ['Yes', 'yes']);
    expect(duplicate).toMatchObject({ ok: false, code: 'VALIDATION' });
  });
});
