import {
  type RegistrationDTO,
  type RegistrationHomeDTO,
  type RegistrationOfferDTO,
  timesOverlap,
} from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Registration, RegistrationOffer, Section } from '../src/models';
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

const CS_OFFICE = 'cs.office@comsats.edu.pk';
const ZAINAB = 'FA23-BCS-004';
const HASSAN = 'FA23-BCS-005';
const MARYAM = 'FA23-BCS-006';
const BASE = '/api/academics/registration';

const send = (cookie: string, method: string, path: string, body?: unknown) =>
  app.api(cookie, `${BASE}${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const home = async (identifier: string): Promise<RegistrationHomeDTO> =>
  (await app.api(await app.login(identifier), BASE)).json();

const sectionOffers = (h: RegistrationHomeDTO, name: string) =>
  h.offers.filter((o) => o.section.name === name);

const meetTogether = (a: RegistrationOfferDTO, b: RegistrationOfferDTO) =>
  a.slots.some((sa) =>
    b.slots.some((sb) => sb.day === sa.day && timesOverlap(sa.start, sa.end, sb.start, sb.end)),
  );

describe('course registration', () => {
  it('offers next term from the degree plans, with teachers and no clashes', async () => {
    const h = await home(ACCOUNTS.hira);
    expect(h.term).toMatchObject({ code: 'SP27', name: 'Spring 2027' });
    expect(h.window.open).toBe(true);
    expect(sectionOffers(h, 'BCS-7A').map((o) => o.code)).toEqual(['CSC460', 'CSC475', 'CSC499']);
    expect(h.offers.every((o) => o.instructor && o.slots.length > 0)).toBe(true);
    for (const [i, a] of h.offers.entries()) {
      for (const b of h.offers.slice(i + 1)) {
        const sameSection = a.section.id === b.section.id;
        const sameTeacher = a.instructor?.id === b.instructor?.id;
        if (sameSection || sameTeacher) expect(meetTogether(a, b)).toBe(false);
      }
    }
    expect(h.record?.passed).toContain('CSC462');
    expect(h.record?.inProgress).toEqual(expect.arrayContaining(['CSC337', 'CSC498']));
    expect(h.registration).toBeNull();
    // Ali's approved plan and Ahmed's sent one hold a seat each in BCS-7A's courses.
    expect(sectionOffers(h, 'BCS-7A').every((o) => o.seatsTaken === 2)).toBe(true);
  });

  it('holds seats live when a plan is sent, and the batch advisor approves it', async () => {
    const h = await home(ACCOUNTS.hira);
    const offers = sectionOffers(h, 'BCS-7A');
    const hira = await app.login(ACCOUNTS.hira);
    const saved = await send(hira, 'PUT', '/plan', { offerIds: offers.map((o) => o.id) });
    expect(saved.status).toBe(200);
    const draft: RegistrationDTO = await saved.json();
    expect(draft).toMatchObject({ status: 'draft', credits: 9 });
    expect(draft.handledBy).toBe('Dr. Imran Haider (batch advisor)');
    // Only warnings: CSC498 is in progress, and 9 credit hours is part-time.
    expect(draft.issues.every((i) => i.level === 'warn')).toBe(true);

    const watcher = await app.connect(ACCOUNTS.usman);
    const seats = nextEvent(watcher, 'registration:seats');
    const advisor = await app.connect(ACCOUNTS.imran);
    const told = nextEvent(advisor, 'notification:new', (n) => n.type === 'registration');
    const sent = await send(hira, 'POST', '/plan/submit');
    expect(sent.status).toBe(200);
    const plan: RegistrationDTO = await sent.json();
    expect(plan.status).toBe('submitted');
    expect((await seats).offers.find((o) => o.id === offers[0]?.id)?.seatsTaken).toBe(3);
    expect((await told).title).toBe('Hira Khan sent a course plan for Spring 2027');

    // It can't be changed while it waits; only her advisor can see and decide it.
    expect((await send(hira, 'PUT', '/plan', { offerIds: [] })).status).toBe(400);
    expect((await send(hira, 'POST', `/${plan.id}/approve`)).status).toBe(403);
    const fatima = await app.login(ACCOUNTS.fatima);
    expect((await send(fatima, 'GET', `/${plan.id}`)).status).toBe(404);
    const imran = await app.login(ACCOUNTS.imran);
    const waiting: RegistrationDTO[] = await (await send(imran, 'GET', '/approvals')).json();
    expect(waiting[0]?.status).toBe('submitted');
    expect(waiting.find((r) => r.id === plan.id)?.canHandle).toBe(true);

    const student = await app.connect(ACCOUNTS.hira);
    const approvedNote = nextEvent(student, 'notification:new', (n) => n.type === 'registration');
    const approved = await send(imran, 'POST', `/${plan.id}/approve`, { note: 'Good plan.' });
    expect(((await approved.json()) as RegistrationDTO).status).toBe('approved');
    expect(await approvedNote).toMatchObject({ title: 'Course plan approved', body: 'Good plan.' });
    expect((await send(hira, 'PUT', '/plan', { offerIds: [] })).status).toBe(400);
  });

  it('refuses plans that break the rules', async () => {
    const h = await home(ZAINAB);
    const zainab = await app.login(ZAINAB);
    // Human Computer Interaction (BSE-5A) was passed in the sixth semester.
    const hci = h.offers.find((o) => o.code === 'CSC356');
    if (!hci) throw new Error('No CSC356 offer');
    const draft: RegistrationDTO = await (
      await send(zainab, 'PUT', '/plan', { offerIds: [hci.id] })
    ).json();
    expect(draft.issues.map((i) => i.message)).toContain('You have already passed CSC356.');
    const refused = await send(zainab, 'POST', '/plan/submit');
    expect(refused.status).toBe(400);
    expect((await refused.json()).error.message).toBe('You have already passed CSC356.');

    // The same course in two sections.
    const twice = h.offers.filter((o) => o.code === 'CSC475');
    expect(twice.length).toBeGreaterThan(1);
    const both: RegistrationDTO = await (
      await send(zainab, 'PUT', '/plan', { offerIds: twice.map((o) => o.id) })
    ).json();
    expect(both.issues.map((i) => i.message)).toContain(
      'CSC475 is in your plan twice. Keep one section.',
    );
    // Courses that aren't offered next term can't be added.
    expect(
      (await send(zainab, 'PUT', '/plan', { offerIds: ['64b7f0c2a1b2c3d4e5f60718'] })).status,
    ).toBe(400);
  });

  it('gives the last seat to only one of two students sending at once', async () => {
    const h = await home(HASSAN);
    const offer = sectionOffers(h, 'BCS-7A').find((o) => o.code === 'CSC475');
    if (!offer) throw new Error('No CSC475 offer');
    await RegistrationOffer.updateOne(
      { _id: offer.id },
      { $set: { capacity: offer.seatsTaken + 1 } },
    );
    const [hassan, maryam] = await Promise.all([app.login(HASSAN), app.login(MARYAM)]);
    for (const cookie of [hassan, maryam]) {
      expect((await send(cookie, 'PUT', '/plan', { offerIds: [offer.id] })).status).toBe(200);
    }
    const results = await Promise.all([
      send(hassan, 'POST', '/plan/submit'),
      send(maryam, 'POST', '/plan/submit'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const after = await RegistrationOffer.findById(offer.id).lean();
    expect(after?.seatsTaken).toBe(after?.capacity);

    // Taking the plan back frees the seat for the other student.
    const winner = results[0]?.status === 200 ? hassan : maryam;
    const other = winner === hassan ? maryam : hassan;
    expect((await send(winner, 'POST', '/plan/withdraw')).status).toBe(200);
    expect((await send(other, 'POST', '/plan/submit')).status).toBe(200);
  });

  it('returns a plan with a note (freeing its seats) and follows the window', async () => {
    const ahmed = await userBy(ACCOUNTS.ahmed);
    const plan = await Registration.findOne({ studentId: ahmed._id }).lean();
    if (!plan) throw new Error('Ahmed has no plan');
    const before = await RegistrationOffer.findById(plan.heldOfferIds[0]).lean();
    const student = await app.connect(ACCOUNTS.ahmed);
    const told = nextEvent(student, 'notification:new', (n) => n.type === 'registration');
    const imran = await app.login(ACCOUNTS.imran);
    expect((await send(imran, 'POST', `/${plan._id}/return`, { note: '' })).status).toBe(400);
    const returned: RegistrationDTO = await (
      await send(imran, 'POST', `/${plan._id}/return`, { note: 'Add an elective.' })
    ).json();
    expect(returned.status).toBe('returned');
    expect(await told).toMatchObject({
      title: 'Course plan returned for changes',
      body: 'Add an elective.',
    });
    const after = await RegistrationOffer.findById(plan.heldOfferIds[0]).lean();
    expect(after?.seatsTaken).toBe((before?.seatsTaken ?? 0) - 1);

    // The Director's Office closes registration: plans can't change; opening it tells students.
    const hira = await app.login(ACCOUNTS.hira);
    expect((await send(hira, 'PUT', '/window', { mode: 'open' })).status).toBe(403);
    const director = await app.login(ACCOUNTS.director);
    expect(
      (
        (await (await send(director, 'PUT', '/window', { mode: 'closed' })).json()) as {
          open: boolean;
        }
      ).open,
    ).toBe(false);
    const ahmedCookie = await app.login(ACCOUNTS.ahmed);
    const closed = await send(ahmedCookie, 'PUT', '/plan', { offerIds: [] });
    expect(closed.status).toBe(400);
    expect((await closed.json()).error.message).toBe('Registration is closed.');
    const opened = nextEvent(student, 'notification:new', (n) =>
      n.title.startsWith('Course registration for Spring 2027 is open'),
    );
    await send(director, 'PUT', '/window', { mode: 'open' });
    await opened;
  });

  it('lets the department office manage offers; students hear about new times', async () => {
    const office = await app.login(CS_OFFICE);
    const section = await Section.findOne({ name: 'BCS-7A' }).lean();
    const imran = await userBy(ACCOUNTS.imran);
    const offer = {
      code: 'CSC334',
      sectionId: String(section?._id),
      instructorId: String(imran._id),
      capacity: 30,
      slots: [{ day: 6, start: '08:30', end: '10:00' }],
    };
    const created = await send(office, 'POST', '/offers', offer);
    expect(created.status).toBe(201);
    const dto: RegistrationOfferDTO = await created.json();
    expect(dto).toMatchObject({
      code: 'CSC334',
      title: 'Parallel and Distributed Computing',
      canManage: true,
    });
    expect((await send(office, 'POST', '/offers', offer)).status).toBe(409);
    // BCS-7A already has a class then.
    const h = await home(ACCOUNTS.hira);
    const busy = sectionOffers(h, 'BCS-7A').find((o) => o.code !== 'CSC334')?.slots[0];
    const clash = await send(office, 'PUT', `/offers/${dto.id}`, { ...offer, slots: [busy] });
    expect(clash.status).toBe(409);
    expect((await clash.json()).error.message).toMatch(/^BCS-7A already has CSC\d+ on /);
    expect((await send(await app.login(ACCOUNTS.hira), 'POST', '/offers', offer)).status).toBe(403);
    expect((await send(office, 'DELETE', `/offers/${dto.id}`)).status).toBe(200);

    // New times for a course students have sent: they are told.
    const held = sectionOffers(h, 'BCS-7A').find((o) => o.code === 'CSC499');
    if (!held) throw new Error('No CSC499 offer');
    const ali = await app.connect(ACCOUNTS.ali);
    const told = nextEvent(ali, 'notification:new', (n) =>
      n.title.startsWith('New times for CSC499'),
    );
    const moved = await send(office, 'PUT', `/offers/${held.id}`, {
      code: held.code,
      sectionId: held.section.id,
      instructorId: held.instructor?.id ?? null,
      capacity: held.capacity,
      slots: [{ day: 6, start: '14:00', end: '17:00' }],
    });
    expect(moved.status).toBe(200);
    await told;
    expect((await send(office, 'DELETE', `/offers/${held.id}`)).status).toBe(409);
    const list = await (await send(office, 'GET', `/offers/${held.id}/students`)).json();
    expect(list).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Ali Raza', status: 'approved' })]),
    );
    const student = await app.login(ACCOUNTS.ahmed);
    expect((await send(student, 'GET', `/offers/${held.id}/students`)).status).toBe(403);
    expect(
      await (await send(office, 'POST', '/offers/plan', { sectionId: held.section.id })).json(),
    ).toEqual({ created: 0 });
  });
});
