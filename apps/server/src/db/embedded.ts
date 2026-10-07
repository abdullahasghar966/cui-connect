import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { REPO_ROOT } from '../config/paths';

export const EMBEDDED_DB_PATH = path.resolve(REPO_ROOT, env.EMBEDDED_MONGO_DIR);

export function embeddedMongoUri(port = env.EMBEDDED_MONGO_PORT): string {
  return `mongodb://127.0.0.1:${port}/`;
}

/**
 * Starts a real `mongod` (downloaded once by mongodb-memory-server) that stores its data on
 * disk, so the app needs no MongoDB installation and data survives restarts.
 */
export async function startEmbeddedMongo(
  port = env.EMBEDDED_MONGO_PORT,
  dbPath = EMBEDDED_DB_PATH,
): Promise<MongoMemoryServer> {
  await mkdir(dbPath, { recursive: true });
  return MongoMemoryServer.create({
    instance: { port, dbPath, ip: '127.0.0.1', storageEngine: 'wiredTiger' },
  });
}

export async function isMongoReachable(uri: string, timeoutMs = 1500): Promise<boolean> {
  const client = new mongoose.mongo.MongoClient(uri, {
    serverSelectionTimeoutMS: timeoutMs,
    connectTimeoutMS: timeoutMs,
  });
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    return true;
  } catch {
    return false;
  } finally {
    await client.close().catch(() => {});
  }
}
