/**
 * tests/helpers/db.js – connect, clean and disconnect the in-memory test database.
 *
 * Usage in an integration test file:
 *   beforeAll(connectTestDB); afterEach(clearTestDB); afterAll(closeTestDB);
 *
 * WHY CLEAN AFTER EACH TEST? Tests must be INDEPENDENT. One test's leftover data must
 * never make another test pass or fail by accident, whatever order they run in.
 */
import mongoose from 'mongoose';
import { clearOutbox } from '../../src/emails/sendEmail.js';

export async function connectTestDB() {
  await mongoose.connect(process.env.MONGO_URI); // URI set by tests/setup/env.js
  // Build every model's indexes (e.g. unique email) before tests rely on them
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
}

export async function clearTestDB() {
  const { collections } = mongoose.connection;
  // Delete all documents but keep collections + indexes (faster than dropping)
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  clearOutbox(); // and forget the emails "sent" by the previous test
}

export async function closeTestDB() {
  await mongoose.connection.dropDatabase(); // remove this worker's database
  await mongoose.disconnect();
}
