/**
 * api/index.js – entry point for Vercel (serverless hosting).
 *
 * On Vercel there is no long-running server.js. Each request calls this function.
 * vercel.json sends EVERY URL here. We make sure the (cached) DB connection exists,
 * then hand the request to the same Express app used locally.
 */
import { connectDB } from '../src/config/db.js';
import app from '../src/app.js';

export default async function handler(req, res) {
  await connectDB(); // cheap after the first call thanks to the cache in db.js
  return app(req, res); // an Express app is itself a (req, res) function
}
