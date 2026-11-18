/**
 * src/config/db.js – opens the connection to MongoDB (through Mongoose).
 *
 * WHAT: `connectDB()` connects once and returns the same connection on every later call.
 * WHY THE CACHE? On serverless hosts (Vercel) each request may call connectDB().
 *       Opening a new connection per request is slow and runs out of connections, so we
 *       keep it on `global`, which survives between requests in the same instance.
 * USED BY: src/server.js (local), api/index.js (Vercel), src/db/scripts/*.
 */
import mongoose from 'mongoose';
import env from './env.js';

// Filters may only use fields that exist in the schema; unknown fields are ignored.
mongoose.set('strictQuery', true);

// Reuse a cache stored on `global` if one exists, otherwise create an empty one.
let cached = global._mongo;
if (!cached) cached = global._mongo = { conn: null, promise: null };

export async function connectDB() {
  // 1) Already connected → just return the connection
  if (cached.conn) return cached.conn;
  // 2) Not connecting yet → start ONE connection attempt and remember its promise
  if (!cached.promise) {
    cached.promise = mongoose.connect(env.MONGO_URI, {
      maxPoolSize: 5, // at most 5 parallel connections from this app instance
      bufferCommands: false, // fail fast instead of silently queueing when not connected
      // Building indexes on start is convenient in development. In production we build
      // them on purpose with `npm run db:indexes`, because it can be slow on big data.
      autoIndex: !env.isProduction,
    });
  }
  // 3) Wait for that attempt (shared by everyone who called connectDB meanwhile)
  cached.conn = await cached.promise;
  return cached.conn;
}
