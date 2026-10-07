/** `npm run db`: runs the embedded MongoDB as its own long-lived process (used by `npm run dev`). */
import { env } from '../config/env';
import { logger } from '../lib/logger';
import {
  EMBEDDED_DB_PATH,
  embeddedMongoUri,
  isMongoReachable,
  startEmbeddedMongo,
} from './embedded';

const uri = embeddedMongoUri();

if (await isMongoReachable(uri)) {
  logger.info(`Embedded MongoDB is already running at ${uri}`);
  // Stay alive so `concurrently -k` doesn't stop the other dev processes.
  setInterval(() => {}, 2 ** 30);
} else {
  logger.info('Starting embedded MongoDB (the first run downloads the binary once)...');
  const server = await startEmbeddedMongo();
  logger.info(`Embedded MongoDB ready at ${uri} (port ${env.EMBEDDED_MONGO_PORT})`);
  logger.info(`Data directory: ${EMBEDDED_DB_PATH}`);

  const shutdown = async () => {
    await server.stop({ doCleanup: false }).catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
