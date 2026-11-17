// Local development entry: connect to MongoDB, then start the HTTP server.
import env from './config/env.js';
import { connectDB } from './config/db.js';
import app from './app.js';

try {
  await connectDB();
  console.log('✔ MongoDB connected');
} catch (err) {
  console.error('❌ MongoDB connection failed:', err.message);
  process.exit(1);
}

const server = app.listen(env.PORT, () => {
  console.log(`✔ API running on http://localhost:${env.PORT}/api (${env.NODE_ENV})`);
});

// Graceful shutdown (Ctrl+C)
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
