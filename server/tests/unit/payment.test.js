/**
 * UNIT tests for the payments module's small building blocks (no database, no network):
 *  - money helpers (rupees → paisa) and the 30-minute payment window
 *  - the cron-secret guard (401 missing, 403 wrong, both header styles, constant-time compare)
 *  - the Stripe gateway: lazy client, delegation, and REAL signature verification using
 *    Stripe's own test-header generator (pure HMAC maths, works offline)
 */
import { jest } from '@jest/globals';
import Stripe from 'stripe';
import env from '../../src/config/env.js';
import { PAYMENTS } from '../../src/config/constants.js';
import { toMinorUnits, isPaymentWindowOver } from '../../src/modules/payments/payment.service.js';
import { safeEqual, requireCronSecret } from '../../src/modules/payments/cron.middleware.js';
import { stripeGateway } from '../../src/modules/payments/stripe.gateway.js';

// Remember the real settings so every test can change them and we can put them back
const original = { ...env };
afterEach(() => {
  Object.assign(env, original);
  jest.restoreAllMocks();
});

describe('Money and time helpers', () => {
  it('converts rupees to paisa (Stripe wants the smallest unit)', () => {
    expect(toMinorUnits(1250)).toBe(125000);
    expect(toMinorUnits(0)).toBe(0);
  });

  it('knows when the payment window of an order is over', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const justInside = new Date(now.getTime() - PAYMENTS.UNPAID_CARD_EXPIRY_MS);
    const tooOld = new Date(now.getTime() - PAYMENTS.UNPAID_CARD_EXPIRY_MS - 1);
    expect(isPaymentWindowOver({ createdAt: justInside }, now)).toBe(false);
    expect(isPaymentWindowOver({ createdAt: tooOld }, now)).toBe(true);
    // Default `now` = the real clock: a brand-new order is never expired
    expect(isPaymentWindowOver({ createdAt: new Date() })).toBe(false);
  });

  it('exposes the payment constants the rest of the app relies on', () => {
    expect(PAYMENTS.CURRENCY).toBe('pkr');
    expect(PAYMENTS.UNPAID_CARD_EXPIRY_MS).toBe(30 * 60 * 1000);
    expect(PAYMENTS.PAID_EVENTS).toContain('checkout.session.completed');
    expect(Object.isFrozen(PAYMENTS)).toBe(true);
  });
});

describe('Cron secret guard', () => {
  // Runs the middleware with fake headers and returns what it passed to next()
  const run = (headers) => {
    const next = jest.fn();
    requireCronSecret({ headers }, {}, next);
    return next.mock.calls[0][0]; // undefined = allowed, ApiError = blocked
  };

  beforeEach(() => {
    env.CRON_SECRET = 'top-secret-value';
  });

  it('safeEqual compares strings safely (different lengths never match)', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('401 when no secret is sent', () => {
    expect(run({}).statusCode).toBe(401);
    expect(run({ authorization: 'Basic abc' }).statusCode).toBe(401); // not a Bearer header
  });

  it('403 when the secret is wrong', () => {
    const error = run({ 'x-cron-secret': 'guess' });
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Invalid cron secret');
  });

  it('403 for every caller when the server has no CRON_SECRET (job switched off)', () => {
    env.CRON_SECRET = '';
    expect(run({ 'x-cron-secret': 'anything' }).statusCode).toBe(403);
  });

  it('accepts x-cron-secret and "Authorization: Bearer" (what Vercel Cron sends)', () => {
    expect(run({ 'x-cron-secret': 'top-secret-value' })).toBeUndefined();
    expect(run({ authorization: 'Bearer top-secret-value' })).toBeUndefined();
  });
});

describe('Stripe gateway', () => {
  const secret = 'whsec_unit_test_secret';

  it('is configured only when a secret key is set', () => {
    env.STRIPE_SECRET_KEY = '';
    expect(stripeGateway.isConfigured()).toBe(false);
    env.STRIPE_SECRET_KEY = 'sk_test_fake';
    expect(stripeGateway.isConfigured()).toBe(true);
  });

  it('creates ONE client lazily and reuses it (no network involved)', () => {
    env.STRIPE_SECRET_KEY = 'sk_test_fake';
    const client = stripeGateway.getClient();
    expect(stripeGateway.getClient()).toBe(client);
    expect(typeof client.checkout.sessions.create).toBe('function');
  });

  it('createCheckoutSession passes the params to Stripe and returns its answer', async () => {
    env.STRIPE_SECRET_KEY = 'sk_test_fake';
    const fake = { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' };
    // Replace ONLY the network call; everything else is the real library
    const create = jest
      .spyOn(stripeGateway.getClient().checkout.sessions, 'create')
      .mockResolvedValue(fake);
    await expect(stripeGateway.createCheckoutSession({ mode: 'payment' })).resolves.toBe(fake);
    expect(create).toHaveBeenCalledWith({ mode: 'payment' });
  });

  it('constructEvent accepts a correctly signed body and returns the event', () => {
    const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const event = stripeGateway.constructEvent(Buffer.from(payload), header, secret);
    expect(event.id).toBe('evt_1');
  });

  it('constructEvent throws for a wrong secret, a changed body or a garbage header', () => {
    const payload = JSON.stringify({ id: 'evt_1' });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(() => stripeGateway.constructEvent(payload, header, 'whsec_other')).toThrow();
    expect(() => stripeGateway.constructEvent(`${payload} `, header, secret)).toThrow();
    expect(() => stripeGateway.constructEvent(payload, 'nonsense', secret)).toThrow();
  });

  it('constructEvent rejects an old signature (replay protection, 5 minute tolerance)', () => {
    const payload = JSON.stringify({ id: 'evt_old' });
    const timestamp = Math.floor(Date.now() / 1000) - 10 * 60; // signed 10 minutes ago
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });
    expect(() => stripeGateway.constructEvent(payload, header, secret)).toThrow(/tolerance/i);
  });
});
