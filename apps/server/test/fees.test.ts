import {
  addDays,
  amountOn,
  campusClock,
  campusInstant,
  type FeeChallanDTO,
  type FeeDeskDTO,
  feeItemsFor,
  type MyFeesDTO,
} from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FeeChallan, Notification, Section, Term, User } from '../src/models';
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

const CLERK = 'accounts.office@comsats.edu.pk';
const today = () => campusClock().date;

const send = (cookie: string, method: string, path: string, body?: unknown) =>
  app.api(cookie, path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const myFees = async (identifier: string): Promise<MyFeesDTO> =>
  (await app.api(await app.login(identifier), '/api/services/fees')).json();

const challanOf = async (identifier: string, instalment: string): Promise<FeeChallanDTO> => {
  const term = await Term.findOne({ current: true }).lean();
  const found = (await myFees(identifier)).challans.find(
    (c) => c.instalment === instalment && c.term.id === String(term?._id),
  );
  if (!found) throw new Error(`${identifier} has no ${instalment} challan this term`);
  return found;
};

describe('fees', () => {
  it('show each student only their own challans; the fee desk is for Accounts and IT', async () => {
    const ahmed = await myFees(ACCOUNTS.ahmed);
    const current = ahmed.challans.filter((c) => c.term.code === 'FA26');
    expect(current.map((c) => c.instalment).sort()).toEqual(['first', 'second']);
    expect(current.find((c) => c.instalment === 'first')?.status).toBe('paid');
    expect(current.find((c) => c.instalment === 'second')?.status).not.toBe('paid');
    expect(ahmed.outstanding).toBeGreaterThanOrEqual(51_000);
    // Earlier terms since his FA23 intake were paid in full.
    expect(ahmed.challans.filter((c) => c.instalment === 'full').length).toBe(6);
    expect(ahmed.challans.every((c) => c.student.regNo === 'FA23-BCS-003')).toBe(true);
    expect((await myFees(ACCOUNTS.hira)).outstanding).toBe(0);

    for (const who of [ACCOUNTS.hira, ACCOUNTS.exam, ACCOUNTS.imran]) {
      const cookie = await app.login(who);
      expect((await app.api(cookie, '/api/services/fees/desk')).status).toBe(403);
    }
    const clerk = await app.login(CLERK);
    const desk: FeeDeskDTO = await (await app.api(clerk, '/api/services/fees/desk')).json();
    const term = await Term.findOne({ current: true }).lean();
    expect(desk.stats.challans).toBe(await FeeChallan.countDocuments({ termId: term?._id }));
    expect(desk.stats.paid + desk.stats.due + desk.stats.overdue).toBe(desk.stats.challans);
    // Overdue first, then due, then paid.
    expect(desk.rows[0]?.status).not.toBe('paid');
    expect((await app.api(await app.login(ACCOUNTS.admin), '/api/services/fees/desk')).status).toBe(
      200,
    );

    const unpaid: FeeDeskDTO = await (
      await app.api(clerk, '/api/services/fees/desk?status=unpaid&q=ahmed')
    ).json();
    expect(unpaid.rows.length).toBeGreaterThan(0);
    expect(unpaid.rows.every((r) => r.status !== 'paid' && r.student.name.includes('Ahmed'))).toBe(
      true,
    );
    const section = await Section.findOne({ name: 'BCS-7B' }).lean();
    const bySection: FeeDeskDTO = await (
      await app.api(clerk, `/api/services/fees/desk?sectionId=${section?._id}&instalment=first`)
    ).json();
    expect(bySection.rows.every((r) => r.student.sectionName === 'BCS-7B')).toBe(true);
    expect(bySection.rows.every((r) => r.instalment === 'first')).toBe(true);
  });

  it('records a payment and tells the student live; it can be undone', async () => {
    const challan = await challanOf(ACCOUNTS.ahmed, 'second');
    const student = await app.connect(ACCOUNTS.ahmed);
    const told = nextEvent(student, 'notification:new', (n) => n.type === 'fees');
    const clerk = await app.login(CLERK);

    // Students can't record payments; dates in the future are refused.
    const ahmed = await app.login(ACCOUNTS.ahmed);
    const path = `/api/services/fees/challans/${challan.id}`;
    expect((await send(ahmed, 'POST', `${path}/paid`, { paidOn: today() })).status).toBe(403);
    expect(
      (await send(clerk, 'POST', `${path}/paid`, { paidOn: addDays(today(), 1) })).status,
    ).toBe(400);

    const paid = await send(clerk, 'POST', `${path}/paid`, { paidOn: today(), bankRef: 'BR-77' });
    expect(paid.status).toBe(200);
    const dto: FeeChallanDTO = await paid.json();
    expect(dto).toMatchObject({ status: 'paid', paidOn: today(), bankRef: 'BR-77' });
    expect(dto.payable).toBe(amountOn(challan, today()));
    expect((await told).title).toMatch(/^Fee received: Rs /);
    expect((await send(clerk, 'POST', `${path}/paid`, { paidOn: today() })).status).toBe(409);
    expect((await send(clerk, 'DELETE', path)).status).toBe(409);

    const corrected = nextEvent(
      student,
      'notification:new',
      (n) => n.title === 'Fee record corrected',
    );
    const undone: FeeChallanDTO = await (await send(clerk, 'POST', `${path}/unpaid`)).json();
    expect(undone.status).not.toBe('paid');
    expect(undone.paidOn).toBeNull();
    await corrected;
  });

  it('adds the late fee after the due date', async () => {
    const challan = await challanOf(ACCOUNTS.usman, 'second');
    await FeeChallan.updateOne({ _id: challan.id }, { $set: { dueDate: addDays(today(), -5) } });
    const late = await challanOf(ACCOUNTS.usman, 'second');
    expect(late.status).toBe('overdue');
    expect(late.payable).toBe(late.total + late.lateFee);

    const student = await app.connect(ACCOUNTS.usman);
    const told = nextEvent(student, 'notification:new', (n) => n.type === 'fees');
    const clerk = await app.login(CLERK);
    const paid: FeeChallanDTO = await (
      await send(clerk, 'POST', `/api/services/fees/challans/${challan.id}/paid`, {
        paidOn: today(),
      })
    ).json();
    expect(paid.payable).toBe(late.total + late.lateFee);
    expect((await told).body).toMatch(/with the late fee/);
  });

  it('issues challans to a section, skipping students who already have one', async () => {
    const term = await Term.findOne({ current: true }).lean();
    const section = await Section.findOne({ name: 'BCS-7B' }).lean();
    const students = await User.find({ sectionId: section?._id, role: 'student' }).distinct('_id');
    await FeeChallan.deleteMany({ termId: term?._id, studentId: { $in: students } });

    const usman = await app.connect(ACCOUNTS.usman);
    const told = nextEvent(usman, 'notification:new', (n) => n.type === 'fees');
    const clerk = await app.login(CLERK);
    const run = (body: Record<string, unknown>) =>
      send(clerk, 'POST', '/api/services/fees/challans', {
        instalment: 'second',
        scope: 'section',
        sectionId: String(section?._id),
        dueDate: addDays(today(), 10),
        items: feeItemsFor('second'),
        ...body,
      });

    const first = await run({});
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ issued: students.length, skipped: 0 });
    const notice = await told;
    expect(notice.title).toBe('Fee challan: Fall 2026 second instalment');
    expect(notice.body).toMatch(/^Rs 51,000 due by /);

    expect(await (await run({})).json()).toEqual({ issued: 0, skipped: students.length });
    // A full-semester challan can't sit next to instalments; the first instalment can.
    expect(await (await run({ instalment: 'full', items: feeItemsFor('full') })).json()).toEqual({
      issued: 0,
      skipped: students.length,
    });
    expect(await (await run({ instalment: 'first', items: feeItemsFor('first') })).json()).toEqual({
      issued: students.length,
      skipped: 0,
    });

    expect((await run({ dueDate: addDays(today(), -1) })).status).toBe(400);
    expect((await run({ scope: 'section', sectionId: null })).status).toBe(400);
    const hira = await app.login(ACCOUNTS.hira);
    expect(
      (
        await send(hira, 'POST', '/api/services/fees/challans', {
          instalment: 'second',
          scope: 'campus',
          dueDate: addDays(today(), 10),
          items: feeItemsFor('second'),
        })
      ).status,
    ).toBe(403);

    // An unpaid challan issued by mistake can be withdrawn; the student is told.
    const mine = await challanOf(ACCOUNTS.usman, 'first');
    const withdrawn = nextEvent(
      usman,
      'notification:new',
      (n) => n.title === 'Fee challan withdrawn',
    );
    expect((await send(clerk, 'DELETE', `/api/services/fees/challans/${mine.id}`)).status).toBe(
      200,
    );
    await withdrawn;
    expect(await FeeChallan.exists({ _id: mine.id })).toBeNull();
  });

  it('reminds unpaid students before the due date and again once it is overdue', async () => {
    resetReminderMemory();
    const challan = await challanOf(ACCOUNTS.ahmed, 'second');
    const [ahmed, hira] = await Promise.all([userBy(ACCOUNTS.ahmed), userBy(ACCOUNTS.hira)]);

    await runReminders(campusInstant(addDays(challan.dueDate, -3), '08:05'));
    expect(
      await Notification.exists({ userId: ahmed._id, title: /^Fee due in 3 days: Rs 51,000$/ }),
    ).toBeTruthy();
    // Hira has paid.
    expect(await Notification.exists({ userId: hira._id, title: /^Fee due in/ })).toBeNull();

    await runReminders(campusInstant(addDays(challan.dueDate, 1), '08:05'));
    expect(
      await Notification.exists({ userId: ahmed._id, title: 'Fee overdue: now Rs 52,000' }),
    ).toBeTruthy();
    // Each is sent once, even after a restart forgets what it did.
    resetReminderMemory();
    await runReminders(campusInstant(addDays(challan.dueDate, 1), '09:00'));
    expect(await Notification.countDocuments({ userId: ahmed._id, title: /^Fee overdue/ })).toBe(1);
  });
});
