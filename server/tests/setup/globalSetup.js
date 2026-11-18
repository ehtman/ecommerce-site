/**
 * tests/setup/globalSetup.js – runs ONCE before all test files.
 *
 * Starts a throw-away MongoDB *replica set* in memory. A replica set (not a single
 * server) is used because later modules (orders) need MongoDB transactions, and
 * transactions only work on replica sets. Your real Atlas database is never touched.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';

export default async function globalSetup() {
  // Start a 1-member replica set (enough for transactions)
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  // Keep it on `globalThis` so globalTeardown can stop it
  globalThis.__MONGO_REPLSET__ = replSet;
  // Test workers start AFTER this, so they inherit this environment variable
  process.env.MONGO_URI_BASE = replSet.getUri();
}
