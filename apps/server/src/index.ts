import { env } from './config/env';
import { resolveMongo } from './db/resolve';
import { logger } from './lib/logger';
import { startServer } from './server';

const mongo = await resolveMongo({ waitForEmbedded: process.argv.includes('--wait-for-db') });
logger.info(`MongoDB: ${mongo.mode === 'external' ? 'MONGODB_URI' : `embedded (${mongo.uri})`}`);

const server = await startServer({
  port: env.PORT,
  mongoUri: mongo.uri,
  dbName: env.MONGO_DB_NAME,
  autoSeed: env.AUTO_SEED,
  resetSeed: env.SEED_ON_START === 'reset',
});
logger.info(`CUI Connect API + Socket.IO listening on ${server.url}`);

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info(`${signal} received, shutting down`);
  await server.close().catch((err) => logger.error({ err }, 'Error while closing server'));
  await mongo.stop().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
