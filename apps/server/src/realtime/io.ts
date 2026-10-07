import type { Server as HttpServer } from 'node:http';
import type { GroupType, LiveStatsDTO } from '@cui/shared';
import { Server } from 'socket.io';
import { authenticateToken, readSessionCookie } from '../auth/session';
import { Group, Membership } from '../models';
import { registerConnection } from './handlers';
import { attachRealtime, detachRealtime, publishStats } from './notifier';
import { connectionCount, onlineUserIds } from './presence';
import { rateSnapshot } from './stats';
import type { AdminNamespace, IoServer } from './types';

/** Announcement channels contain everyone, so they don't scope presence updates. */
const NON_PRESENCE_TYPES: GroupType[] = ['CAMPUS_ANNOUNCEMENT', 'DEPARTMENT_ANNOUNCEMENT'];

export function liveStats(): LiveStatsDTO {
  return {
    onlineUsers: onlineUserIds().length,
    connections: connectionCount(),
    ...rateSnapshot(),
    at: new Date().toISOString(),
  };
}

export function createRealtime(httpServer: HttpServer): {
  io: IoServer;
  close: () => Promise<void>;
} {
  const io: IoServer = new Server(httpServer, {
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    // Brief network drops resume with the same rooms and replay missed events.
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000, skipMiddlewares: false },
  });

  // Authenticate the handshake with the same httpOnly session cookie as the REST API, and
  // resolve memberships up front so rooms can be joined synchronously on connect.
  io.use(async (socket, next) => {
    try {
      const user = await authenticateToken(readSessionCookie(socket.handshake.headers.cookie));
      if (!user) return next(new Error('UNAUTHENTICATED'));
      const groupIds = (await Membership.find({ userId: user._id }).distinct('groupId')).map(
        String,
      );
      const presenceGroupIds = (
        await Group.find({ _id: { $in: groupIds }, type: { $nin: NON_PRESENCE_TYPES } }).distinct(
          '_id',
        )
      ).map(String);
      socket.data = {
        userId: String(user._id),
        name: user.name,
        role: user.role,
        groupIds,
        presenceGroupIds,
      };
      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error('INTERNAL'));
    }
  });
  io.on('connection', (socket) => registerConnection(io, socket));

  const admin: AdminNamespace = io.of('/admin');
  admin.use(async (socket, next) => {
    const user = await authenticateToken(readSessionCookie(socket.handshake.headers.cookie)).catch(
      () => null,
    );
    if (!user) return next(new Error('UNAUTHENTICATED'));
    if (user.role !== 'admin') return next(new Error('FORBIDDEN'));
    socket.data = { userId: String(user._id), name: user.name, role: user.role };
    next();
  });
  admin.on('connection', (socket) => socket.emit('stats', liveStats()));

  const timer = setInterval(() => {
    if (admin.sockets.size) publishStats(liveStats());
  }, 5000);
  timer.unref();

  attachRealtime(io, admin);

  return {
    io,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(timer);
        detachRealtime();
        io.close(() => resolve());
      }),
  };
}
