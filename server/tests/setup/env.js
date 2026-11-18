/**
 * tests/setup/env.js – runs before EVERY test file (Jest "setupFiles").
 *
 * Sets the environment variables our app needs, so `src/config/env.js` does not
 * exit with "missing variables". All values here are fake and only for tests.
 */
process.env.NODE_ENV = 'test'; // email goes to the in-memory outbox, logs are quiet
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.JWT_EXPIRES_IN = '1h';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'Admin12345';
// Rate limits are OFF in tests by default, so tests can call routes many times.
// tests/integration/rateLimit.test.js switches them back ON to prove they work.
process.env.RATE_LIMIT_ENABLED = 'false';

// Every Jest worker (parallel process) gets its OWN database, so test files never clash.
const worker = process.env.JEST_WORKER_ID || '1';
const base = process.env.MONGO_URI_BASE || 'mongodb://127.0.0.1:27017/';
const url = new URL(base);
url.pathname = `/shopease_test_${worker}`;
process.env.MONGO_URI = url.toString();
