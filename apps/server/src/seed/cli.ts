/** `npm run seed`: resets the database and loads the demo campus. */
import mongoose from 'mongoose';
import { env } from '../config/env';
import { resolveMongo } from '../db/resolve';
import { logger } from '../lib/logger';
import { initModels } from '../models';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './data';
import { seedDatabase } from './seed';

const mongo = await resolveMongo();
try {
  await mongoose.connect(mongo.uri, { dbName: env.MONGO_DB_NAME });
  await initModels();
  const summary = await seedDatabase();
  logger.info(
    `Seeded ${summary.users} accounts, ${summary.groups} groups and ${summary.messages} messages.`,
  );
  console.log(`\nDemo accounts (password for all: ${DEMO_PASSWORD})`);
  console.table(
    DEMO_ACCOUNTS.map((a) => ({ account: a.label, signInWith: a.identifier, role: a.role })),
  );
} finally {
  await mongoose.disconnect();
  await mongo.stop();
}
process.exit(0);
