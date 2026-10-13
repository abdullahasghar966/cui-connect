import type { BusRouteDTO, TransportDTO } from '@cui/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SavedRoute } from '../src/models';
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

const BASE = '/api/campus/transport';
const send = (cookie: string, method: string, path: string, body?: unknown) =>
  app.api(cookie, path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const home = async (identifier: string): Promise<TransportDTO> =>
  (await app.api(await app.login(identifier), BASE)).json();

const routeOne = async (identifier: string) => {
  const route = (await home(identifier)).routes.find((r) => r.name.startsWith('Route 1'));
  if (!route) throw new Error('No Route 1');
  return route;
};

const asInput = (route: BusRouteDTO) => ({
  name: route.name,
  bus: route.bus,
  capacity: route.capacity,
  days: route.days,
  stops: route.stops,
  notes: route.notes,
});

describe('transport', () => {
  it('shows every route; drivers’ phones only to staff and IT; people follow a route from a stop', async () => {
    const mine = await home(ACCOUNTS.hira);
    expect(mine.canManage).toBe(false);
    expect(mine.routes).toHaveLength(3);
    expect(mine.routes.every((r) => r.driver === null)).toBe(true);
    expect((await home(ACCOUNTS.exam)).routes[0]?.driver?.phone).toMatch(/^0300-/);
    expect((await home(ACCOUNTS.admin)).canManage).toBe(true);

    const route = await routeOne(ACCOUNTS.hira);
    const hira = await app.login(ACCOUNTS.hira);
    const path = `${BASE}/routes/${route.id}/saved`;
    expect((await send(hira, 'PUT', path, { saved: true, stop: 'Nowhere' })).status).toBe(400);
    const followed: BusRouteDTO = await (
      await send(hira, 'PUT', path, { saved: true, stop: 'Faizabad' })
    ).json();
    expect(followed).toMatchObject({ saved: true, myStop: 'Faizabad' });
  });

  it('tells followers about new times and same-day notices; only IT changes routes', async () => {
    const route = await routeOne(ACCOUNTS.admin);
    const admin = await app.login(ACCOUNTS.admin);
    const hira = await app.login(ACCOUNTS.hira);
    const path = `${BASE}/routes/${route.id}`;
    expect((await send(hira, 'PUT', path, asInput(route))).status).toBe(403);
    expect(
      (await send(admin, 'PUT', path, { ...asInput(route), stops: [...route.stops].reverse() }))
        .status,
    ).toBe(400);

    // Faizabad leaves the route: its followers are told and their stop is cleared.
    const usman = await app.connect(ACCOUNTS.usman);
    const told = nextEvent(usman, 'notification:new', (n) => n.title.startsWith('New times for'));
    const changed = await send(admin, 'PUT', path, {
      ...asInput(route),
      stops: route.stops.filter((s) => s.name !== 'Faizabad'),
    });
    expect(changed.status).toBe(200);
    expect((await told).body).toBe('Faizabad is no longer on the route. Check your stop.');
    const student = await userBy(ACCOUNTS.usman);
    expect((await SavedRoute.findOne({ userId: student._id }).lean())?.stop).toBeNull();

    const late = nextEvent(usman, 'notification:new', (n) =>
      n.title.endsWith('Running 15 minutes late'),
    );
    const noticed: BusRouteDTO = await (
      await send(admin, 'PUT', `${path}/notice`, { text: 'Running 15 minutes late' })
    ).json();
    expect(noticed.notice).toBe('Running 15 minutes late');
    expect((await late).title).toBe('Route 1: Rawalpindi Saddar: Running 15 minutes late');
    expect((await routeOne(ACCOUNTS.usman)).notice).toBe('Running 15 minutes late');
    const cleared: BusRouteDTO = await (
      await send(admin, 'PUT', `${path}/notice`, { text: null })
    ).json();
    expect(cleared.notice).toBeNull();
  });

  it('tells followers when a route stops running', async () => {
    const route = (await home(ACCOUNTS.admin)).routes.find((r) => r.name.startsWith('Route 3'));
    if (!route) throw new Error('No Route 3');
    const hira = await app.login(ACCOUNTS.hira);
    await send(hira, 'PUT', `${BASE}/routes/${route.id}/saved`, { saved: true, stop: 'Aabpara' });
    const socket = await app.connect(ACCOUNTS.hira);
    const told = nextEvent(
      socket,
      'notification:new',
      (n) => n.title === `${route.name} no longer runs`,
    );
    const admin = await app.login(ACCOUNTS.admin);
    expect((await send(admin, 'DELETE', `${BASE}/routes/${route.id}`)).status).toBe(200);
    await told;
    expect((await home(ACCOUNTS.hira)).routes).toHaveLength(2);
  });
});
