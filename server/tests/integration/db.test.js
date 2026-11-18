/**
 * INTEGRATION test for src/config/db.js: connectDB() connects once and reuses it.
 */
import mongoose from 'mongoose';
import { connectDB } from '../../src/config/db.js';

afterAll(() => mongoose.disconnect());

describe('connectDB', () => {
  it('connects to MongoDB and returns the SAME connection on later calls (cache)', async () => {
    const first = await connectDB();
    const second = await connectDB();
    expect(mongoose.connection.readyState).toBe(1); // 1 = connected
    expect(second).toBe(first);
  });
});
