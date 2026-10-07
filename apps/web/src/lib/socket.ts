import type {
  Ack,
  AckError,
  AdminServerToClientEvents,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@cui/shared';
import { io, type Socket } from 'socket.io-client';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type AdminSocket = Socket<AdminServerToClientEvents>;

let socket: AppSocket | null = null;

/** One shared connection per signed-in tab; the session cookie authenticates the handshake. */
export function getSocket(): AppSocket {
  socket ??= io({
    autoConnect: false,
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function closeSocket(): void {
  socket?.disconnect();
  socket?.removeAllListeners();
  socket = null;
}

export function connectAdminSocket(): AdminSocket {
  return io('/admin', { withCredentials: true, transports: ['websocket', 'polling'] });
}

export const ACK_TIMEOUT_MS = 8000;

/** Normalises acknowledgement timeouts into the same `{ ok: false }` shape as server errors. */
export async function withAck<R extends Ack<unknown>>(pending: Promise<R>): Promise<R | AckError> {
  try {
    return await pending;
  } catch {
    return {
      ok: false,
      code: 'INTERNAL',
      message: 'No response from the server. Check your connection and try again.',
    };
  }
}
