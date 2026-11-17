// server/src/config/db.js
import mongoose from 'mongoose';
import env from './env.js';

mongoose.set('strictQuery', true);           // ignore unknown filter fields

let cached = global._mongo;
if (!cached) cached = global._mongo = { conn: null, promise: null };

export async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(env.MONGO_URI, {
      maxPoolSize: 5,
      bufferCommands: false,
      autoIndex: env.NODE_ENV !== 'production',   // build indexes by script in prod
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
