/**
 * INTEGRATION test proving the rate limits really work.
 *
 * tests/setup/env.js turns limits OFF for all other tests. Here we switch them ON
 * BEFORE the app is loaded. That's why we use `await import()` instead of a normal
 * import at the top: normal imports would load the app before this line runs.
 * (Each Jest test file gets its own fresh copy of every module.)
 */
process.env.RATE_LIMIT_ENABLED = 'true';
const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');

describe('Rate limiting', () => {
  it('blocks the 6th admin-login attempt within 15 minutes with 429', async () => {
    const attempt = () =>
      request(app).post('/api/auth/admin/login').send({ email: 'x@test.com', password: '' });

    // The first 5 attempts reach validation (400); the limiter counts them anyway
    for (let i = 0; i < 5; i += 1) {
      expect((await attempt()).status).toBe(400);
    }
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe('Too many attempts, try again later');
    // Standard headers tell the client its quota
    expect(blocked.headers['ratelimit-limit']).toBeDefined();
  });
});
