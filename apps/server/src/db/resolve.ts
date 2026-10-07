import { setTimeout as delay } from 'node:timers/promises';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import {
  EMBEDDED_DB_PATH,
  embeddedMongoUri,
  isMongoReachable,
  startEmbeddedMongo,
} from './embedded';

export interface MongoTarget {
  uri: string;
  mode: 'external' | 'embedded-shared' | 'embedded-owned';
  stop: () => Promise<void>;
}

const noop = async () => {};

/**
 * Decides which MongoDB to use:
 * 1. MONGODB_URI when configured (Atlas or a local install);
 * 2. otherwise an embedded mongod that is already running (e.g. `npm run dev` starts one);
 * 3. otherwise wait for it (`waitForEmbedded`) or start one inside this process.
 */
export async function resolveMongo({ waitForEmbedded = false } = {}): Promise<MongoTarget> {
  if (env.MONGODB_URI) return { uri: env.MONGODB_URI, mode: 'external', stop: noop };

  const uri = embeddedMongoUri();
  if (await isMongoReachable(uri)) return { uri, mode: 'embedded-shared', stop: noop };

  if (waitForEmbedded) {
    logger.info('Waiting for the embedded MongoDB (the first run downloads it once)...');
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      await delay(1000);
      if (await isMongoReachable(uri)) return { uri, mode: 'embedded-shared', stop: noop };
    }
    throw new Error(`Embedded MongoDB did not become reachable at ${uri}`);
  }

  logger.info(`Starting embedded MongoDB (data in ${EMBEDDED_DB_PATH})...`);
  const server = await startEmbeddedMongo();
  return {
    uri,
    mode: 'embedded-owned',
    stop: async () => {
      await server.stop({ doCleanup: false });
    },
  };
}
