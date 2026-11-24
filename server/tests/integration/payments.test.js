/**
 * INTEGRATION tests for /api/payments (Stripe card payments) and the card side of orders.
 *
 * Stripe is never called over the network:
 *  - creating a Checkout Session is replaced by a fake (`stripeGateway.createCheckoutSession`)
 *  - webhooks are signed for real with Stripe's own `generateTestHeaderString` and a test
 *    secret, so the REAL signature check runs (it is pure maths, no network)
 *
 * Key promises:
 *  - only a correctly SIGNED webhook can mark an order paid (the client never can)
 *  - repeated / simultaneous webhook deliveries change the order once (idempotency)
 *  - the expiry job needs the cron secret, cancels stale unpaid card orders, restores stock
 */
import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import {
  api,
  loggedIn,
  bearer,
  createAdmin,
  createUser,
  createProduct,
  createOrder,
  createCoupon,
  createAddress,
  addToCart,
} from '../helpers/factories.js';
import env from '../../src/config/env.js';
import { Order, Product, Coupon } from '../../src/modules/models.js';
import { outbox } from '../../src/emails/sendEmail.js';
import { stripeGateway } from '../../src/modules/payments/stripe.gateway.js';
import { expireUnpaidOrders } from '../../src/modules/payments/payment.service.js';
import { cancelWithRestore } from '../../src/modules/orders/order.service.js';

const WEBHOOK_SECRET = 'whsec_test_secret_for_jest';
const CRON_SECRET = 'jest-cron-secret';
const original = { ...env }; // real settings, restored after each test
const realCreateSession = stripeGateway.createCheckoutSession;
let sessionCalls; // what our code sent to "Stripe" in the current test

beforeAll(connectTestDB);
beforeEach(() => {
  // Turn card payments ON with fake keys for every test (tests that need OFF change it)
  Object.assign(env, {
    PAYMENT_CARD_ENABLED: true,
    STRIPE_SECRET_KEY: 'sk_test_fake_key',
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CRON_SECRET,
  });
  sessionCalls = [];
  // Expected error logs (Stripe down, amount mismatch…) would only clutter the test output
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  // The fake Stripe: remembers the params and answers like Stripe would
  stripeGateway.createCheckoutSession = async (params) => {
    sessionCalls.push(params);
    const id = `cs_test_${sessionCalls.length}_${Date.now()}`;
    return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
  };
});
afterEach(async () => {
  Object.assign(env, original);
  stripeGateway.createCheckoutSession = realCreateSession;
  jest.restoreAllMocks();
  await clearTestDB();
});
afterAll(closeTestDB);

// ---------- helpers ----------
const missingId = () => new mongoose.Types.ObjectId().toString();
const OLD = () => new Date(Date.now() - 31 * 60 * 1000); // older than the 30-minute window
// Timestamps are managed by Mongoose, so we change createdAt with a raw driver update
const backdate = (order, date = OLD()) =>
  Order.collection.updateOne({ _id: order._id }, { $set: { createdAt: date } });
const cardOrder = (user, overrides = {}) =>
  createOrder(user, { paymentMethod: 'CARD', ...overrides });

const checkout = (auth, orderId) =>
  api().post('/api/payments/checkout-session').set('Authorization', auth).send({ orderId });

// A Stripe Checkout Session object as it appears inside a webhook event
const sessionFor = (order, overrides = {}) => ({
  id: order.paymentResult?.sessionId || 'cs_test_unknown',
  object: 'checkout.session',
  payment_status: 'paid',
  payment_intent: 'pi_test_123',
  amount_total: order.totalPrice * 100,
  currency: 'pkr',
  metadata: { orderId: String(order._id) },
  ...overrides,
});
const eventFor = (session, type = 'checkout.session.completed') => ({
  id: `evt_${Date.now()}`,
  object: 'event',
  type,
  data: { object: session },
});

// Sends a webhook exactly like Stripe: raw JSON body + Stripe-Signature header
function sendWebhook(event, { secret = WEBHOOK_SECRET, signature, body } = {}) {
  const payload = JSON.stringify(event);
  const header = signature ?? Stripe.webhooks.generateTestHeaderString({ payload, secret });
  const req = api().post('/api/payments/webhook').set('Content-Type', 'application/json');
  if (header) req.set('Stripe-Signature', header);
  return req.send(body ?? payload); // a string is sent byte-for-byte
}

const cron = (secret, method = 'get') => {
  const req = api()[method]('/api/payments/expire-unpaid');
  return secret ? req.set('x-cron-secret', secret) : req;
};

// =======================================================================================
describe('POST /api/payments/checkout-session', () => {
  it('401 without a token', async () => {
    const res = await api().post('/api/payments/checkout-session').send({ orderId: missingId() });
    expect(res.status).toBe(401);
  });

  it('403 for an admin (paying is a customer action)', async () => {
    const admin = await createAdmin();
    const res = await checkout(bearer(admin), missingId());
    expect(res.status).toBe(403);
  });

  it('403 for a customer whose email is not verified', async () => {
    const { auth } = await loggedIn({ isEmailVerified: false });
    const res = await checkout(auth, missingId());
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/verify your email/i);
  });

  it('400 when orderId is missing or not an id', async () => {
    const { auth } = await loggedIn();
    for (const orderId of [undefined, 'abc', 123]) {
      const res = await checkout(auth, orderId);
      expect(res.status).toBe(400);
      expect(res.body.errors[0]).toEqual({ field: 'orderId', message: 'Invalid order' });
    }
  });

  it('400 when card payments are switched off or Stripe has no key', async () => {
    const { user, auth } = await loggedIn();
    const order = await cardOrder(user);

    env.PAYMENT_CARD_ENABLED = false;
    let res = await checkout(auth, order._id);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Card payments are not configured');

    env.PAYMENT_CARD_ENABLED = true;
    env.STRIPE_SECRET_KEY = '';
    res = await checkout(auth, order._id);
    expect(res.status).toBe(400);
    expect(sessionCalls).toHaveLength(0); // Stripe was never asked
  });

  it("404 for an unknown order and for ANOTHER customer's order (no IDOR)", async () => {
    const { auth } = await loggedIn();
    const stranger = await createUser();
    const theirs = await cardOrder(stranger);
    expect((await checkout(auth, missingId())).status).toBe(404);
    const res = await checkout(auth, theirs._id);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Order not found');
  });

  it.each([
    ['a Cash on Delivery order', { paymentMethod: 'COD' }, 'This order is not a card order'],
    ['an already paid order', { paymentStatus: 'paid' }, 'This order is already paid'],
    ['an order that is no longer pending', { status: 'cancelled' }, 'can no longer be paid'],
  ])('400 for %s', async (_name, overrides, message) => {
    const { user, auth } = await loggedIn();
    const order = await cardOrder(user, overrides);
    const res = await checkout(auth, order._id);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
  });

  it('400 when the 30-minute payment window is over (even before the job ran)', async () => {
    const { user, auth } = await loggedIn();
    const order = await cardOrder(user);
    await backdate(order);
    const res = await checkout(auth, order._id);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/time to pay/);
  });

  it('502 when Stripe cannot be reached', async () => {
    const { user, auth } = await loggedIn();
    const order = await cardOrder(user);
    stripeGateway.createCheckoutSession = async () => {
      throw new Error('connect ETIMEDOUT');
    };
    const res = await checkout(auth, order._id);
    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/payment provider/);
    expect((await Order.findById(order._id)).paymentResult).toBeUndefined();
  });

  it('200: sends the SERVER total to Stripe, saves the session id, returns the URL', async () => {
    const { user, auth } = await loggedIn();
    const order = await cardOrder(user, { quantity: 2 }); // 2 × 1000 + 250 shipping = 2250

    const res = await checkout(auth, order._id);
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    const [params] = sessionCalls;
    expect(params.mode).toBe('payment');
    expect(params.customer_email).toBe(user.email);
    expect(params.line_items[0].price_data).toMatchObject({ currency: 'pkr', unit_amount: 225000 });
    expect(params.metadata).toEqual({ orderId: String(order._id) });
    expect(params.client_reference_id).toBe(String(order._id));
    expect(params.success_url).toBe(`http://localhost:5173/order-success/${order._id}`);

    const saved = await Order.findById(order._id);
    expect(saved.paymentResult.sessionId).toBe(res.body.data.sessionId);
    // Creating a payment page is NOT paying: the order is still unpaid and pending
    expect(saved.paymentStatus).toBe('pending');
    expect(saved.status).toBe('pending');
  });

  it('the client can never mark an order paid through this route (extra fields ignored)', async () => {
    const { user, auth } = await loggedIn();
    const order = await cardOrder(user);
    const res = await api()
      .post('/api/payments/checkout-session')
      .set('Authorization', auth)
      .send({ orderId: order._id, paymentStatus: 'paid', amount: 1, status: 'confirmed' });
    expect(res.status).toBe(200);
    const saved = await Order.findById(order._id);
    expect(saved.paymentStatus).toBe('pending');
    expect(sessionCalls[0].line_items[0].price_data.unit_amount).toBe(order.totalPrice * 100);
  });
});

// =======================================================================================
describe('POST /api/payments/webhook', () => {
  // A customer with a CARD order that already has a checkout session
  async function orderWithSession(overrides = {}) {
    const user = await createUser();
    const order = await cardOrder(user, {
      paymentResult: { provider: 'stripe', sessionId: `cs_test_${Date.now()}` },
      ...overrides,
    });
    return { user, order };
  }

  it('400 when webhooks are not configured (no signing secret)', async () => {
    const { order } = await orderWithSession();
    env.STRIPE_WEBHOOK_SECRET = '';
    const res = await sendWebhook(eventFor(sessionFor(order)));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Stripe webhooks are not configured');
  });

  it('400 without a Stripe-Signature header', async () => {
    const { order } = await orderWithSession();
    const res = await sendWebhook(eventFor(sessionFor(order)), { signature: '' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Missing Stripe signature');
  });

  it('400 for a signature made with the WRONG secret (a faker) – order stays unpaid', async () => {
    const { order } = await orderWithSession();
    const res = await sendWebhook(eventFor(sessionFor(order)), { secret: 'whsec_attacker' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid Stripe signature');
    expect((await Order.findById(order._id)).paymentStatus).toBe('pending');
  });

  it('400 when the body was changed after signing (e.g. a smaller amount)', async () => {
    const { order } = await orderWithSession();
    const event = eventFor(sessionFor(order));
    const payload = JSON.stringify(event);
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const tampered = payload.replace('"paid"', '"paid" ');
    const res = await sendWebhook(event, { signature, body: tampered });
    expect(res.status).toBe(400);
  });

  it('400 for a garbage signature header', async () => {
    const { order } = await orderWithSession();
    const res = await sendWebhook(eventFor(sessionFor(order)), { signature: 't=1,v1=abc' });
    expect(res.status).toBe(400);
  });

  it('200 and ignored for event types we do not handle', async () => {
    const { order } = await orderWithSession();
    const res = await sendWebhook(eventFor(sessionFor(order), 'customer.created'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      received: true,
      handled: false,
      reason: 'ignored-event-type',
    });
    expect((await Order.findById(order._id)).paymentStatus).toBe('pending');
  });

  it('200 but NOT paid while the payment is still processing (payment_status unpaid)', async () => {
    const { order } = await orderWithSession();
    const res = await sendWebhook(eventFor(sessionFor(order, { payment_status: 'unpaid' })));
    expect(res.body.data.reason).toBe('not-paid-yet');
    expect((await Order.findById(order._id)).paymentStatus).toBe('pending');
  });

  it('200 and ignored when no card order matches (e.g. `stripe trigger` test events)', async () => {
    const res = await sendWebhook(
      eventFor({ id: 'cs_test_nobody', payment_status: 'paid', metadata: { orderId: 'oops' } }),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.reason).toBe('order-not-found');
  });

  it('a COD order is never marked paid by a webhook', async () => {
    const user = await createUser();
    const cod = await createOrder(user);
    const res = await sendWebhook(eventFor(sessionFor(cod)));
    expect(res.body.data.reason).toBe('order-not-found');
    expect((await Order.findById(cod._id)).paymentStatus).toBe('pending');
  });

  it('marks the order PAID + CONFIRMED and sends ONE confirmation email', async () => {
    const { user, order } = await orderWithSession();
    const res = await sendWebhook(eventFor(sessionFor(order)));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      handled: true,
      reason: 'paid',
      orderId: String(order._id),
    });

    const saved = await Order.findById(order._id);
    expect(saved.paymentStatus).toBe('paid');
    expect(saved.status).toBe('confirmed');
    expect(saved.paidAt).toBeInstanceOf(Date);
    expect(saved.paymentResult).toMatchObject({
      provider: 'stripe',
      sessionId: order.paymentResult.sessionId,
      paymentIntentId: 'pi_test_123',
    });
    const last = saved.statusHistory.at(-1);
    expect(last).toMatchObject({ status: 'confirmed', note: 'Card payment received' });
    expect(last.changedBy ?? null).toBeNull(); // changed by "the system", not a person

    const mails = outbox.filter((m) => m.to === user.email);
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toMatch(/confirmed/);
  });

  it('also works for async_payment_succeeded and finds the order by metadata alone', async () => {
    const user = await createUser();
    const order = await cardOrder(user); // no session id saved on the order
    const session = sessionFor(order, { id: 'cs_test_unsaved', payment_intent: null });
    const res = await sendWebhook(eventFor(session, 'checkout.session.async_payment_succeeded'));
    expect(res.body.data.reason).toBe('paid');
    const saved = await Order.findById(order._id);
    expect(saved.paymentStatus).toBe('paid');
    expect(saved.paymentResult.paymentIntentId).toBeUndefined();
  });

  it('still records payments when the card flag was switched off meanwhile', async () => {
    const { order } = await orderWithSession();
    env.PAYMENT_CARD_ENABLED = false; // money already moved: we must not lose it
    const res = await sendWebhook(eventFor(sessionFor(order)));
    expect(res.body.data.reason).toBe('paid');
  });

  it('IDEMPOTENT: the same event delivered twice changes the order once, one email', async () => {
    const { user, order } = await orderWithSession();
    const event = eventFor(sessionFor(order));
    const first = await sendWebhook(event);
    const second = await sendWebhook(event);
    expect(first.body.data.reason).toBe('paid');
    expect(second.status).toBe(200); // still 2xx, so Stripe stops retrying
    expect(second.body.data.reason).toBe('already-paid');

    const saved = await Order.findById(order._id);
    expect(saved.statusHistory.filter((h) => h.status === 'confirmed')).toHaveLength(1);
    expect(outbox.filter((m) => m.to === user.email)).toHaveLength(1);
  });

  it('IDEMPOTENT under a race: two deliveries at the same moment → exactly one wins', async () => {
    const { user, order } = await orderWithSession();
    const event = eventFor(sessionFor(order));
    const results = await Promise.all([sendWebhook(event), sendWebhook(event), sendWebhook(event)]);
    const reasons = results.map((r) => r.body.data.reason).sort();
    expect(reasons).toEqual(['already-paid', 'already-paid', 'paid']);
    expect(outbox.filter((m) => m.to === user.email)).toHaveLength(1);
  });

  it.each([
    ['amount', { amount_total: 100 }],
    ['currency', { currency: 'usd' }],
  ])('does NOT mark paid when the %s does not match the order', async (_name, overrides) => {
    const { order } = await orderWithSession();
    const res = await sendWebhook(eventFor(sessionFor(order, overrides)));
    expect(res.status).toBe(200);
    expect(res.body.data.reason).toBe('amount-mismatch');
    expect((await Order.findById(order._id)).paymentStatus).toBe('pending');
  });

  it('a payment that arrives after the order was cancelled is recorded, status stays cancelled', async () => {
    const { order } = await orderWithSession({ status: 'cancelled' });
    const res = await sendWebhook(eventFor(sessionFor(order)));
    expect(res.body.data).toMatchObject({ handled: true, reason: 'paid-after-cancel' });
    const saved = await Order.findById(order._id);
    expect(saved.paymentStatus).toBe('paid'); // admin refunds it in the Stripe dashboard
    expect(saved.status).toBe('cancelled');
  });

  it('is mounted BEFORE express.json: a JSON body that was not signed byte-for-byte fails', async () => {
    const { order } = await orderWithSession();
    // Pretty-printed JSON = same data, different bytes → the signature no longer matches
    const event = eventFor(sessionFor(order));
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: JSON.stringify(event),
      secret: WEBHOOK_SECRET,
    });
    const res = await sendWebhook(event, { signature, body: JSON.stringify(event, null, 2) });
    expect(res.status).toBe(400);
  });
});

// =======================================================================================
describe('GET/POST /api/payments/expire-unpaid (cron job)', () => {
  it('401 without a secret', async () => {
    const res = await cron();
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Cron secret missing');
  });

  it('403 with a wrong secret, and 403 when the server has no CRON_SECRET', async () => {
    expect((await cron('wrong')).status).toBe(403);
    env.CRON_SECRET = '';
    expect((await cron('wrong')).status).toBe(403);
  });

  it('a customer token is not a cron secret', async () => {
    const { auth } = await loggedIn();
    const res = await api().get('/api/payments/expire-unpaid').set('Authorization', auth);
    expect(res.status).toBe(403);
  });

  it('accepts "Authorization: Bearer <secret>" (Vercel Cron) and POST', async () => {
    const viaBearer = await api()
      .get('/api/payments/expire-unpaid')
      .set('Authorization', `Bearer ${CRON_SECRET}`);
    expect(viaBearer.status).toBe(200);
    const viaPost = await cron(CRON_SECRET, 'post');
    expect(viaPost.status).toBe(200);
    expect(viaPost.body.data).toEqual({ checked: 0, cancelled: 0, skipped: 0 });
  });

  it('cancels ONLY stale unpaid card orders and restores their stock and coupon use', async () => {
    const user = await createUser();
    // Stock 18 and sold 2 = "2 units were reserved by the order below"
    const product = await createProduct({ stock: 18, sold: 2 });
    const coupon = await createCoupon({ usedCount: 1 });
    const stale = await cardOrder(user, {
      product,
      quantity: 2,
      coupon: { coupon: coupon._id, code: coupon.code, type: 'percentage', value: 10, discount: 0 },
    });
    await backdate(stale);

    // These must all be left alone:
    const fresh = await cardOrder(user); // still inside the 30 minutes
    const oldCod = await createOrder(user); // Cash on Delivery never expires
    const oldPaid = await cardOrder(user, { paymentStatus: 'paid', status: 'confirmed' });
    const oldConfirmed = await cardOrder(user, { status: 'confirmed' });
    await Promise.all([oldCod, oldPaid, oldConfirmed].map((o) => backdate(o)));

    const res = await cron(CRON_SECRET);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ checked: 1, cancelled: 1, skipped: 0 });

    const cancelled = await Order.findById(stale._id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelReason).toBe('Payment not completed in time');
    expect(cancelled.paymentStatus).toBe('pending'); // nothing was paid, nothing to refund

    const restocked = await Product.findById(product._id);
    expect(restocked.stock).toBe(20); // the 2 reserved units are back on the shelf
    expect(restocked.sold).toBe(0);
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(0); // coupon use given back

    for (const keep of [fresh, oldCod, oldPaid, oldConfirmed]) {
      const after = await Order.findById(keep._id);
      expect(after.status).toBe(keep.status);
    }
    // The customer is told their order was cancelled
    expect(outbox.some((m) => m.to === user.email && /cancelled/.test(m.subject))).toBe(true);
  });

  it('running the job twice is harmless (the second run finds nothing)', async () => {
    const user = await createUser();
    const product = await createProduct({ stock: 19, sold: 1 });
    await backdate(await cardOrder(user, { product }));
    expect((await cron(CRON_SECRET)).body.data.cancelled).toBe(1);
    expect((await cron(CRON_SECRET)).body.data).toEqual({ checked: 0, cancelled: 0, skipped: 0 });
    expect((await Product.findById(product._id)).stock).toBe(20); // restored once, not twice
  });

  it('skips an order that got PAID between the search and the cancel (race with the webhook)', async () => {
    const user = await createUser();
    const order = await cardOrder(user);
    await backdate(order);
    // Simulate the webhook winning the race just before the cancel runs
    const cancel = async (id, options) => {
      await Order.updateOne({ _id: id }, { paymentStatus: 'paid', status: 'confirmed' });
      return cancelWithRestore(id, options); // its filter now matches nothing → 404
    };
    const summary = await expireUnpaidOrders({ cancel });
    expect(summary).toEqual({ checked: 1, cancelled: 0, skipped: 1 });
    const saved = await Order.findById(order._id);
    expect(saved.status).toBe('confirmed'); // the paid order was NOT cancelled
  });

  it('one failing order does not stop the job; `now` can move the clock', async () => {
    const user = await createUser();
    const a = await cardOrder(user);
    const b = await cardOrder(user);
    const later = new Date(Date.now() + 31 * 60 * 1000); // "31 minutes from now"
    let calls = 0;
    const cancel = async (id, options) => {
      calls += 1;
      if (calls === 1) throw new Error('database hiccup');
      return cancelWithRestore(id, options);
    };
    const summary = await expireUnpaidOrders({ now: later, cancel });
    expect(summary).toEqual({ checked: 2, cancelled: 1, skipped: 1 });
    const statuses = (await Order.find({ _id: { $in: [a._id, b._id] } })).map((o) => o.status);
    expect(statuses.sort()).toEqual(['cancelled', 'pending']);
  });
});

// =======================================================================================
describe('Card orders on the order side (POST /api/orders) and the full happy path', () => {
  async function customerWithCart() {
    const { user, auth } = await loggedIn();
    const address = await createAddress(user);
    const product = await createProduct({ stock: 5 });
    await addToCart(user, product, 2);
    return { user, auth, address, product };
  }
  const placeOrder = (auth, body) =>
    api().post('/api/orders').set('Authorization', auth).send(body);

  it('400 for a CARD order while card payments are switched off', async () => {
    const { auth, address, product } = await customerWithCart();
    env.PAYMENT_CARD_ENABLED = false;
    const res = await placeOrder(auth, { addressId: address._id, paymentMethod: 'CARD' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Card payments are not available right now');
    expect((await Product.findById(product._id)).stock).toBe(5); // nothing reserved
  });

  it('health check tells the frontend whether to show the card option', async () => {
    expect((await api().get('/api/health')).body.data.cardPaymentsEnabled).toBe(true);
    env.PAYMENT_CARD_ENABLED = false;
    expect((await api().get('/api/health')).body.data.cardPaymentsEnabled).toBe(false);
  });

  it('place CARD order → checkout → signed webhook → paid, confirmed, one email', async () => {
    const { user, auth, address, product } = await customerWithCart();

    // 1) Place the order: stock reserved, pending, NO confirmation email yet
    const placed = await placeOrder(auth, { addressId: address._id, paymentMethod: 'CARD' });
    expect(placed.status).toBe(201);
    expect(placed.body.data).toMatchObject({
      paymentMethod: 'CARD',
      paymentStatus: 'pending',
      status: 'pending',
    });
    expect((await Product.findById(product._id)).stock).toBe(3);
    expect(outbox.filter((m) => m.to === user.email)).toHaveLength(0);

    // 2) Ask for the Stripe page
    const orderId = placed.body.data._id;
    const session = await checkout(auth, orderId);
    expect(session.status).toBe(200);

    // 3) Stripe calls the webhook after the card was charged
    const order = await Order.findById(orderId);
    const res = await sendWebhook(eventFor(sessionFor(order)));
    expect(res.body.data.reason).toBe('paid');

    const paid = await Order.findById(orderId);
    expect(paid.paymentStatus).toBe('paid');
    expect(paid.status).toBe('confirmed');
    expect(outbox.filter((m) => m.to === user.email)).toHaveLength(1);

    // 4) A paid order can no longer be expired by the cron job
    await backdate(paid);
    expect((await cron(CRON_SECRET)).body.data.checked).toBe(0);
  });

  it('a COD order still gets its confirmation email immediately', async () => {
    const { user, auth, address } = await customerWithCart();
    const res = await placeOrder(auth, { addressId: address._id });
    expect(res.status).toBe(201);
    expect(res.body.data.paymentMethod).toBe('COD');
    expect(outbox.filter((m) => m.to === user.email)).toHaveLength(1);
  });
});
