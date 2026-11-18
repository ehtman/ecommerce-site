/**
 * tests/setup/globalTeardown.js – runs ONCE after all test files: stops the in-memory MongoDB.
 */
export default async function globalTeardown() {
  await globalThis.__MONGO_REPLSET__?.stop();
}
