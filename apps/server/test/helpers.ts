import type { ClientToServerEvents, ServerToClientEvents } from '@cui/shared';
import { io as connectClient, type Socket } from 'socket.io-client';
import { inject } from 'vitest';
import { Group, type GroupDoc, User, type UserDoc } from '../src/models';
import { DEMO_PASSWORD } from '../src/seed/data';
import { type RunningServer, startServer } from '../src/server';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Tests assert response shapes structurally, so JSON bodies are loosely typed here. */
// biome-ignore lint/suspicious/noExplicitAny: test-only convenience
export type JsonResponse = Omit<Response, 'json'> & { json: () => Promise<any> };

export interface TestApp {
  server: RunningServer;
  url: string;
  /** Signs in and returns the session cookie (`cui_session=...`). */
  login: (identifier: string, password?: string) => Promise<string>;
  /** Signs in and opens an authenticated Socket.IO connection. */
  connect: (identifier: string) => Promise<ClientSocket>;
  connectWithCookie: (cookie: string) => Promise<ClientSocket>;
  api: (cookie: string | null, path: string, init?: RequestInit) => Promise<JsonResponse>;
  /** Disconnects every client socket opened so far (call between tests). */
  disconnectAll: () => Promise<void>;
  close: () => Promise<void>;
}

/** Starts a server on its own database: the demo campus, or empty with `{ seed: false }`. */
export async function startTestApp({ seed = true } = {}): Promise<TestApp> {
  const dbName = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const server = await startServer({
    port: 0,
    mongoUri: inject('mongoUri'),
    dbName,
    resetSeed: seed,
  });
  const sockets: ClientSocket[] = [];

  const api = (
    cookie: string | null,
    path: string,
    init: RequestInit = {},
  ): Promise<JsonResponse> =>
    fetch(`${server.url}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...(init.headers ?? {}),
      },
    });

  const login = async (identifier: string, password = DEMO_PASSWORD) => {
    const res = await api(null, '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    if (res.status !== 200) throw new Error(`Login failed for ${identifier}: ${res.status}`);
    const setCookie = res.headers.get('set-cookie') ?? '';
    const cookie = setCookie.split(';')[0];
    if (!cookie) throw new Error('No session cookie returned');
    return cookie;
  };

  const connectWithCookie = (cookie: string) =>
    new Promise<ClientSocket>((resolve, reject) => {
      const socket: ClientSocket = connectClient(server.url, {
        transports: ['websocket'],
        extraHeaders: { cookie },
        forceNew: true,
        reconnection: false,
      });
      sockets.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (err) => reject(err));
    });

  return {
    server,
    url: server.url,
    login,
    connect: async (identifier) => connectWithCookie(await login(identifier)),
    connectWithCookie,
    api,
    disconnectAll: async () => {
      for (const s of sockets.splice(0)) s.disconnect();
      // Let the server process the disconnects (presence counters) before the next test.
      await new Promise((resolve) => setTimeout(resolve, 50));
    },
    close: async () => {
      for (const s of sockets.splice(0)) s.disconnect();
      await server.close();
    },
  };
}

/** Resolves with the next matching event payload, or rejects after `timeoutMs`. */
export function nextEvent<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
  predicate: (payload: Parameters<ServerToClientEvents[E]>[0]) => boolean = () => true,
  timeoutMs = 3000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler as never);
      reject(new Error(`Timed out waiting for "${String(event)}"`));
    }, timeoutMs);
    const handler = (payload: Parameters<ServerToClientEvents[E]>[0]) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler as never);
      resolve(payload);
    };
    socket.on(event, handler as never);
  });
}

/** Resolves true if no matching event arrives within `ms` (used to prove isolation). */
export function noEvent<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
  predicate: (payload: Parameters<ServerToClientEvents[E]>[0]) => boolean = () => true,
  ms = 400,
): Promise<boolean> {
  return new Promise((resolve) => {
    const handler = (payload: Parameters<ServerToClientEvents[E]>[0]) => {
      if (!predicate(payload)) return;
      socket.off(event, handler as never);
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      socket.off(event, handler as never);
      resolve(true);
    }, ms);
    socket.on(event, handler as never);
  });
}

export const clientId = () => `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export async function groupByName(name: string): Promise<GroupDoc> {
  const group = await Group.findOne({ name }).lean<GroupDoc>();
  if (!group) throw new Error(`No group named ${name}`);
  return group;
}

export async function userBy(identifier: string): Promise<UserDoc> {
  const user = await User.findOne(
    identifier.includes('@') ? { email: identifier } : { regNo: identifier },
  ).lean<UserDoc>();
  if (!user) throw new Error(`No user ${identifier}`);
  return user;
}

export const ACCOUNTS = {
  admin: 'admin@comsats.edu.pk',
  director: 'director.office@comsats.edu.pk',
  exam: 'exam.office@comsats.edu.pk',
  hodCS: 'ayesha.siddiqui@comsats.edu.pk',
  imran: 'imran.haider@comsats.edu.pk',
  fatima: 'fatima.noor@comsats.edu.pk',
  sana: 'sana.javed@comsats.edu.pk',
  ali: 'FA23-BCS-001',
  hira: 'FA23-BCS-002',
  ahmed: 'FA23-BCS-003',
  usman: 'FA23-BCS-031',
  bilal: 'FA23-BCS-033',
  danish: 'FA23-BEE-001',
  mehwish: 'FA23-BEE-002',
} as const;
