import {
  addDays,
  type CalendarItemDTO,
  type CampusEventDTO,
  campusClock,
  campusInstant,
  type EventDetailDTO,
  type EventsHomeDTO,
} from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CampusEvent, Notification } from '../src/models';
import { resetReminderMemory, runReminders } from '../src/services/reminders';
import { ACCOUNTS, nextEvent, startTestApp, type TestApp, userBy } from './helpers';

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

const AFFAIRS = 'student.affairs@comsats.edu.pk';
const MEHWISH = 'FA23-BEE-002';
const BASE = '/api/campus/events';

const send = (cookie: string, method: string, path: string, body?: unknown) =>
  app.api(cookie, path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const home = async (identifier: string): Promise<EventsHomeDTO> =>
  (await app.api(await app.login(identifier), BASE)).json();

const find = async (identifier: string, title: string) => {
  const event = (await home(identifier)).upcoming.find((e) => e.title.startsWith(title));
  if (!event) throw new Error(`No event ${title}`);
  return event;
};

const draft = (overrides: Record<string, unknown> = {}) => ({
  title: 'Photography Walk',
  description: 'A walk around campus at golden hour with the photography society.',
  category: 'society',
  date: addDays(campusClock().date, 4),
  start: '17:00',
  end: '18:30',
  venue: 'Main Gate',
  organiser: 'Photography Society',
  capacity: null,
  ...overrides,
});

describe('campus events', () => {
  it('takes a place when someone is going, never above the limit, and counts move live', async () => {
    const contest = await find(ACCOUNTS.hira, 'ACM Speed Programming Contest');
    expect(contest).toMatchObject({ capacity: 12, going: 11, myRsvp: null, canEdit: false });
    const path = `${BASE}/${contest.id}/rsvp`;

    const watcher = await app.connect(ACCOUNTS.usman);
    const live = nextEvent(watcher, 'event:rsvps', (e) => e.eventId === contest.id);
    const hira = await app.login(ACCOUNTS.hira);
    const going: CampusEventDTO = await (await send(hira, 'PUT', path, { status: 'going' })).json();
    expect(going).toMatchObject({ going: 12, myRsvp: 'going' });
    expect(await live).toEqual({ eventId: contest.id, going: 12, interested: 3 });

    // Full: Mehwish can only be interested.
    const mehwish = await app.login(MEHWISH);
    const full = await send(mehwish, 'PUT', path, { status: 'going' });
    expect(full.status).toBe(409);
    expect((await full.json()).error.message).toBe('This event is full.');
    expect((await send(mehwish, 'PUT', path, { status: 'interested' })).status).toBe(200);

    // Hira steps back to "interested": her place frees up for Mehwish.
    const moved: CampusEventDTO = await (
      await send(hira, 'PUT', path, { status: 'interested' })
    ).json();
    expect(moved).toMatchObject({ going: 11, interested: 5, myRsvp: 'interested' });
    expect((await send(mehwish, 'PUT', path, { status: 'going' })).status).toBe(200);
    const cleared: CampusEventDTO = await (await send(hira, 'PUT', path, { status: null })).json();
    expect(cleared).toMatchObject({ going: 12, interested: 3, myRsvp: null });

    // A double click counts once.
    const cricket = await find(ACCOUNTS.hira, 'Inter-department Cricket Final');
    const twice = await Promise.all([
      send(hira, 'PUT', `${BASE}/${cricket.id}/rsvp`, { status: 'going' }),
      send(hira, 'PUT', `${BASE}/${cricket.id}/rsvp`, { status: 'going' }),
    ]);
    expect(twice.map((r) => r.status)).toEqual([200, 200]);
    expect((await CampusEvent.findById(cricket.id).lean())?.going).toBe(cricket.going + 1);
  });

  it('waits for Student Affairs when a student organises it; offices publish directly', async () => {
    const affairs = await app.connect(AFFAIRS);
    const toApprove = nextEvent(affairs, 'notification:new', (n) => n.type === 'events');
    const hira = await app.login(ACCOUNTS.hira);
    const created = await send(hira, 'POST', BASE, draft());
    expect(created.status).toBe(201);
    const event: CampusEventDTO = await created.json();
    expect(event.status).toBe('pending');
    expect((await toApprove).title).toBe('Event to approve: Photography Walk');
    expect((await home(ACCOUNTS.usman)).upcoming.some((e) => e.id === event.id)).toBe(false);
    expect((await app.api(await app.login(ACCOUNTS.usman), `${BASE}/${event.id}`)).status).toBe(
      404,
    );
    expect((await home(ACCOUNTS.hira)).waiting.map((e) => e.id)).toContain(event.id);
    expect((await home(AFFAIRS)).waiting.map((e) => e.id)).toContain(event.id);

    const decision = `${BASE}/${event.id}/decision`;
    expect((await send(hira, 'POST', decision, { approve: true })).status).toBe(403);
    const affairsCookie = await app.login(AFFAIRS);
    expect((await send(affairsCookie, 'POST', decision, { approve: false })).status).toBe(400);
    const organiser = await app.connect(ACCOUNTS.hira);
    const published = nextEvent(organiser, 'notification:new', (n) => n.type === 'events');
    const approved: CampusEventDTO = await (
      await send(affairsCookie, 'POST', decision, { approve: true })
    ).json();
    expect(approved.status).toBe('published');
    expect((await published).title).toBe('Your event is published: Photography Walk');
    expect((await home(ACCOUNTS.usman)).upcoming.some((e) => e.id === event.id)).toBe(true);

    const exam = await app.login(ACCOUNTS.exam);
    const direct: CampusEventDTO = await (
      await send(exam, 'POST', BASE, draft({ title: 'Exam Hall Rules Briefing' }))
    ).json();
    expect(direct.status).toBe('published');
    expect(
      (await send(exam, 'POST', BASE, draft({ date: addDays(campusClock().date, -1) }))).status,
    ).toBe(400);
  });

  it('tells the people going about changes and cancellations; only organisers see who is going', async () => {
    const seminar = await find(ACCOUNTS.hira, 'Seminar: Real-time Web Apps');
    const hira = await app.login(ACCOUNTS.hira);
    await send(hira, 'PUT', `${BASE}/${seminar.id}/rsvp`, { status: 'going' });

    const imran = await app.login(ACCOUNTS.imran);
    const detail: EventDetailDTO = await (await app.api(imran, `${BASE}/${seminar.id}`)).json();
    expect(detail.canEdit).toBe(true);
    expect(detail.attendees?.map((a) => a.name)).toContain('Hira Khan');
    const theirs: EventDetailDTO = await (await app.api(hira, `${BASE}/${seminar.id}`)).json();
    expect(theirs.attendees).toBeNull();
    expect((await send(hira, 'PUT', `${BASE}/${seminar.id}`, draft())).status).toBe(403);

    const student = await app.connect(ACCOUNTS.hira);
    const changed = nextEvent(student, 'notification:new', (n) => n.title.startsWith('Changed:'));
    const edit = {
      title: seminar.title,
      description: seminar.description,
      category: seminar.category,
      date: seminar.date,
      start: seminar.start,
      end: seminar.end,
      venue: 'Main Auditorium',
      organiser: seminar.organiser,
      capacity: seminar.capacity,
    };
    expect(
      (await send(imran, 'PUT', `${BASE}/${seminar.id}`, { ...edit, capacity: 1 })).status,
    ).toBe(400);
    expect((await send(imran, 'PUT', `${BASE}/${seminar.id}`, edit)).status).toBe(200);
    expect((await changed).body).toMatch(/Main Auditorium$/);

    const cancelled = nextEvent(student, 'notification:new', (n) =>
      n.title.startsWith('Cancelled:'),
    );
    const done: CampusEventDTO = await (
      await send(imran, 'POST', `${BASE}/${seminar.id}/cancel`, { note: 'The speaker is unwell.' })
    ).json();
    expect(done.status).toBe('cancelled');
    expect((await cancelled).body).toBe('The speaker is unwell.');
    expect((await send(hira, 'PUT', `${BASE}/${seminar.id}/rsvp`, { status: null })).status).toBe(
      400,
    );
  });

  it('reminds people going the evening before and puts the event on My calendar', async () => {
    resetReminderMemory();
    const fair = await find(ACCOUNTS.hira, 'Career Fair 2026');
    const hira = await app.login(ACCOUNTS.hira);
    await send(hira, 'PUT', `${BASE}/${fair.id}/rsvp`, { status: 'going' });

    await runReminders(campusInstant(addDays(fair.date, -1), '18:05'));
    const student = await userBy(ACCOUNTS.hira);
    expect(
      await Notification.exists({
        userId: student._id,
        title: 'Tomorrow: Career Fair 2026 at 10:00 AM',
      }),
    ).toBeTruthy();

    const items: CalendarItemDTO[] = await (
      await app.api(hira, `/api/academics/calendar/mine?from=${fair.date}&to=${fair.date}`)
    ).json();
    expect(items.find((i) => i.kind === 'event')).toMatchObject({
      title: 'Career Fair 2026',
      start: '10:00',
      link: `/campus/events/${fair.id}`,
    });
  });
});
