import { type CampusPlaceDTO, type CampusPlacesDTO, campusClock, isOpenAt } from '@cui/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, startTestApp, type TestApp } from './helpers';

let app: TestApp;

beforeAll(async () => {
  app = await startTestApp();
});

afterAll(async () => {
  await app?.close();
});

const BASE = '/api/campus/places';
const send = (cookie: string, method: string, path: string, body?: unknown) =>
  app.api(cookie, path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const place = {
  name: 'Security Control Room',
  kind: 'facility',
  block: 'Main Gate',
  floor: 0,
  description: 'Lost cards and emergencies, day and night.',
  hours: [{ days: [1, 2, 3, 4, 5, 6, 7], open: '00:00', close: '23:59' }],
};

describe('campus map places', () => {
  it('lists offices and facilities with whether each is open now', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    const map: CampusPlacesDTO = await (await app.api(hira, BASE)).json();
    expect(map.canManage).toBe(false);
    const affairs = map.places.find((p) => p.name === 'Student Affairs');
    expect(affairs).toMatchObject({
      kind: 'office',
      office: 'STUDENT_AFFAIRS',
      block: 'Student Service Centre',
    });
    const now = campusClock();
    expect(affairs?.openNow).toBe(isOpenAt(affairs?.hours ?? [], now.weekday, now.minutes));
    expect(map.places.some((p) => p.name === 'Central Library')).toBe(true);
  });

  it('lets only IT add, change and remove places', async () => {
    const hira = await app.login(ACCOUNTS.hira);
    expect((await send(hira, 'POST', BASE, place)).status).toBe(403);

    const admin = await app.login(ACCOUNTS.admin);
    const created = await send(admin, 'POST', BASE, place);
    expect(created.status).toBe(201);
    const dto: CampusPlaceDTO = await created.json();
    expect(dto.openNow).toBe(isOpenAt(place.hours, campusClock().weekday, campusClock().minutes));
    expect((await send(admin, 'POST', BASE, place)).status).toBe(409);
    expect(
      (
        await send(admin, 'POST', BASE, {
          ...place,
          name: 'Backwards',
          hours: [{ days: [1], open: '17:00', close: '09:00' }],
        })
      ).status,
    ).toBe(400);

    const moved: CampusPlaceDTO = await (
      await send(admin, 'PUT', `${BASE}/${dto.id}`, { ...place, floor: 1, hours: [] })
    ).json();
    expect(moved).toMatchObject({ floor: 1, openNow: null });
    expect((await send(admin, 'DELETE', `${BASE}/${dto.id}`)).status).toBe(200);
    expect((await send(admin, 'DELETE', `${BASE}/${dto.id}`)).status).toBe(404);
  });
});
