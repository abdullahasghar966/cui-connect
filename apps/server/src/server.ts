import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from './http/app';
import { logger } from './lib/logger';
import { initModels, User } from './models';
import { createRealtime } from './realtime/io';
import { resetPresence } from './realtime/presence';
import type { IoServer } from './realtime/types';
import { seedDatabase } from './seed/seed';
import { ensureAcademicDefaults } from './services/academic-setup';
import { startReminderScheduler } from './services/reminders';

export interface StartOptions {
  port: number;
  mongoUri: string;
  dbName: string;
  /** Seed demo data when the database has no users. */
  autoSeed?: boolean;
  /** Wipe and re-seed on every start (used by end-to-end tests). */
  resetSeed?: boolean;
  /** Send due reminders once a minute (off in unit tests, which call them directly). */
  reminders?: boolean;
}

export interface RunningServer {
  url: string;
  port: number;
  io: IoServer;
  close: () => Promise<void>;
}

/** Connects to MongoDB, prepares data and starts HTTP + Socket.IO on one port. */
export async function startServer(options: StartOptions): Promise<RunningServer> {
  await mongoose.connect(options.mongoUri, { dbName: options.dbName });
  await initModels();

  if (options.resetSeed) {
    const summary = await seedDatabase();
    logger.info(summary, 'Database reset with demo data');
  } else if (options.autoSeed && !(await User.exists({}))) {
    const summary = await seedDatabase();
    logger.info(summary, 'Empty database: demo data seeded');
  }
  await ensureAcademicDefaults();

  const httpServer = createServer(createApp());
  const realtime = createRealtime(httpServer);
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port, () => resolve());
  });
  const { port } = httpServer.address() as AddressInfo;
  const stopReminders = options.reminders === false ? () => {} : startReminderScheduler();

  return {
    url: `http://localhost:${port}`,
    port,
    io: realtime.io,
    close: async () => {
      stopReminders();
      await realtime.close();
      resetPresence();
      await mongoose.disconnect();
    },
  };
}
