import type {
  AdminClientToServerEvents,
  AdminServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@cui/shared';
import type { Namespace, Server, Socket } from 'socket.io';

export interface ServerSocketData extends SocketData {
  /** Groups whose rooms this socket joined at connect time. */
  groupIds: string[];
  /** Conversational groups used to scope presence updates (announcement channels excluded). */
  presenceGroupIds: string[];
}

export type IoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  ServerSocketData
>;

export type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  ServerSocketData
>;

export type AdminNamespace = Namespace<
  AdminClientToServerEvents,
  AdminServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export const userRoom = (userId: string) => `user:${userId}`;
export const groupRoom = (groupId: string) => `group:${groupId}`;
