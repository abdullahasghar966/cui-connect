import {
  campusClock,
  type FileDTO,
  type IdCardCheckDTO,
  type IdCardDTO,
  type NotificationDTO,
} from '@cui/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ServiceRequest, User } from '../src/models';
import { ACCOUNTS, startTestApp, type TestApp, userBy } from './helpers';

let app: TestApp;

beforeAll(async () => {
  app = await startTestApp();
});

afterAll(async () => {
  await app?.close();
});

const AFFAIRS = 'student.affairs@comsats.edu.pk';

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const card = async (cookie: string): Promise<IdCardDTO> =>
  (await app.api(cookie, '/api/me/id-card')).json();
const check = async (code: string): Promise<IdCardCheckDTO> =>
  (await app.api(null, `/api/verify/${code}`)).json();
const post = (cookie: string, path: string, body?: unknown) =>
  app.api(cookie, path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('digital ID cards', () => {
  it('shows anyone who scans it only what is on the card, without signing in', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const mine = await card(hira);
    expect(mine).toMatchObject({
      name: 'Hira Khan',
      kind: 'Student',
      regNo: 'FA23-BCS-002',
      sectionName: 'BCS-7A',
      issue: 1,
      status: 'valid',
    });
    expect(mine.programme).toBeTruthy();
    expect(mine.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Opening it again shows the same card.
    expect((await card(hira)).code).toBe(mine.code);

    const res = await app.api(null, `/api/verify/${mine.code}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const result: IdCardCheckDTO = await res.json();
    expect(result.status).toBe('valid');
    expect(result.holder).toEqual({
      name: 'Hira Khan',
      kind: 'Student',
      number: 'FA23-BCS-002',
      department: mine.department,
      validUntil: mine.validUntil,
      issue: 1,
      hasPhoto: false,
    });
    expect(JSON.stringify(result)).not.toContain('@');

    // Unknown or malformed codes say nothing about anyone.
    expect(await check('A'.repeat(24))).toMatchObject({ status: 'invalid', holder: null });
    expect(await check('not-a-card')).toMatchObject({ status: 'invalid', holder: null });

    // Her photo, once she has one, so the person checking can compare faces.
    expect((await app.api(null, `/api/verify/${mine.code}/photo`)).status).toBe(404);
    const photo: FileDTO = await (
      await app.api(hira, '/api/files?purpose=avatar', {
        method: 'POST',
        body: PNG,
        headers: { 'content-type': 'application/octet-stream', 'x-file-name': 'me.png' },
      })
    ).json();
    await app.api(hira, '/api/me/photo', {
      method: 'PUT',
      body: JSON.stringify({ photoId: photo.id }),
    });
    expect((await check(mine.code)).holder?.hasPhoto).toBe(true);
    const image = await app.api(null, `/api/verify/${mine.code}/photo`);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');

    // Faculty cards carry the designation and last while they work here.
    const imran = await card(await app.login(ACCOUNTS.imran));
    expect(imran).toMatchObject({ kind: 'Faculty', regNo: null, validUntil: null });
    expect((await check(imran.code)).holder?.number).toBe(imran.designation);
  });

  it('a replacement card makes the old one stop verifying', async () => {
    const usman = await app.login(ACCOUNTS.usman);
    const old = await card(usman);
    expect(old.issue).toBe(1);

    // Student Affairs complete his lost-card request.
    const usmanDoc = await userBy(ACCOUNTS.usman);
    const request = await ServiceRequest.findOne({ kind: 'idcard', studentId: usmanDoc._id });
    const affairs = await app.login(AFFAIRS);
    expect(
      (
        await post(affairs, `/api/services/requests/${request?._id}/status`, {
          status: 'completed',
        })
      ).status,
    ).toBe(200);

    expect(await check(old.code)).toMatchObject({ status: 'invalid', holder: null });
    const fresh = await card(usman);
    expect(fresh.issue).toBe(2);
    expect(fresh.code).not.toBe(old.code);
    expect((await check(fresh.code)).holder?.name).toBe(usmanDoc.name);
    const notes: { notifications: NotificationDTO[] } = await (
      await app.api(usman, '/api/notifications')
    ).json();
    expect(notes.notifications[0]?.body).toContain('the old card no longer verifies');

    // IT can replace anyone's card; nobody else can.
    const imranDoc = await userBy(ACCOUNTS.imran);
    const imran = await app.login(ACCOUNTS.imran);
    const before = await card(imran);
    expect((await post(imran, `/api/admin/users/${imranDoc._id}/id-card`)).status).toBe(403);
    const admin = await app.login(ACCOUNTS.admin);
    const issued = await post(admin, `/api/admin/users/${imranDoc._id}/id-card`);
    expect(issued.status).toBe(200);
    expect(((await issued.json()) as IdCardDTO).issue).toBe(before.issue + 1);
    expect((await check(before.code)).status).toBe('invalid');
  });

  it('is not valid once it has expired or the account is deactivated', async () => {
    const ahmed = await app.login(ACCOUNTS.ahmed);
    const ahmedCard = await card(ahmed);
    const ahmedDoc = await userBy(ACCOUNTS.ahmed);
    await User.updateOne({ _id: ahmedDoc._id }, { $set: { 'idCard.validUntil': '2020-01-31' } });
    expect(await check(ahmedCard.code)).toMatchObject({ status: 'expired', holder: null });
    expect((await card(ahmed)).status).toBe('expired');

    const bilalCard = await card(await app.login(ACCOUNTS.bilal));
    const bilalDoc = await userBy(ACCOUNTS.bilal);
    const admin = await app.login(ACCOUNTS.admin);
    await app.api(admin, `/api/admin/users/${bilalDoc._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: false }),
    });
    expect(await check(bilalCard.code)).toMatchObject({ status: 'invalid', holder: null });
  });

  it('issues a card the first time someone without one opens it', async () => {
    const ali = await userBy(ACCOUNTS.ali);
    await User.updateOne({ _id: ali._id }, { $set: { idCard: null } });
    const cookie = await app.login(ACCOUNTS.ali);
    // Two tabs at once still end up with one card.
    const [a, b] = await Promise.all([card(cookie), card(cookie)]);
    expect(a.code).toBe(b.code);
    expect(a).toMatchObject({ issue: 1, issuedOn: campusClock().date, status: 'valid' });
  });
});
