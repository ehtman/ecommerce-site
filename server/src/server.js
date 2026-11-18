/**
 * src/server.js – starts the API on your computer (`npm run dev` or `npm start`).
 *
 * Steps: 1) connect to MongoDB  2) start listening for HTTP requests  3) shut down cleanly.
 * We connect FIRST: there is no point accepting requests we cannot answer.
 */
import env from './config/env.js';
import { connectDB } from './config/db.js';
import app from './app.js';

try {
  await connectDB(); // top-level await works because we use ES modules
  console.log('✔ MongoDB connected');
} catch (err) {
  // Most common causes: wrong MONGO_URI, or your IP is not allowed in Atlas → Network Access
  console.error('❌ MongoDB connection failed:', err.message);
  process.exit(1);
}

const server = app.listen(env.PORT, () => {
  console.log(`✔ API running on http://localhost:${env.PORT}/api (${env.NODE_ENV})`);
  console.log(`✔ API docs on   http://localhost:${env.PORT}/api/docs`);
});

// Graceful shutdown: on Ctrl+C (SIGINT) or a hosting platform stop signal (SIGTERM),
// finish the requests already in progress, then exit.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
