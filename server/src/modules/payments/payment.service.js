/**
 * src/modules/payments/payment.service.js – business logic for CARD payments with Stripe.
 *
 * Layers: routes → controller → SERVICE → models / Stripe gateway. No req/res here.
 *
 * THE CARD PAYMENT STORY (read this first)
 *   1. The customer places an order with paymentMethod "CARD" (orders module). Stock is
 *      reserved, the order is "pending" and its paymentStatus is "pending".
 *   2. createCheckoutSession(): we ask Stripe for a HOSTED CHECKOUT page and send the
 *      customer there. They type the card on stripe.com, never on our site.
 *   3. Stripe charges the card and then calls OUR server: a WEBHOOK (an HTTP request from
 *      Stripe to /api/payments/webhook). handleWebhook() checks Stripe's SIGNATURE and
 *      only then marks the order paid + confirmed.
 *   4. If the customer never pays, expireUnpaidOrders() (run by a scheduler = "cron job")
 *      cancels the order after 30 minutes and puts the stock back.
 *
 * WHY CAN'T THE BROWSER SAY "I PAID"? Anything the browser sends can be faked with a tool
 * like Postman. Only Stripe knows whether money moved, and only a request signed with our
 * webhook secret can prove it came from Stripe. So the ONLY code path that sets
 * paymentStatus = "paid" for a card order is the signed webhook below.
 *
 * Concepts: docs/concepts/22-webhooks-signatures-idempotency.md
 */
import mongoose from 'mongoose';
import env from '../../config/env.js';
import { Order } from '../models.js';
import ApiError from '../../utils/ApiError.js';
import { ORDER_STATUS, PAYMENT_METHODS, PAYMENT_STATUS, PAYMENTS } from '../../config/constants.js';
import { cancelWithRestore, sendOrderEmail } from '../orders/order.service.js';
import { stripeGateway } from './stripe.gateway.js';

/** Rupees → paisa (Stripe wants whole numbers of the smallest currency unit). */
export const toMinorUnits = (rupees) => rupees * PAYMENTS.MINOR_UNITS_PER_RUPEE;

/** true when an unpaid card order is older than the payment window (30 min). */
export const isPaymentWindowOver = (order, now = new Date()) =>
  now.getTime() - new Date(order.createdAt).getTime() > PAYMENTS.UNPAID_CARD_EXPIRY_MS;

// Card payments need BOTH the feature flag and a Stripe secret key. Checking here (not in
// every caller) gives one clear message when the shop runs in "Cash on Delivery only" mode.
function assertCardPaymentsReady() {
  if (!env.PAYMENT_CARD_ENABLED || !stripeGateway.isConfigured()) {
    throw new ApiError(400, 'Card payments are not configured');
  }
}

// ---------------------------------------------------------------------------------------
// 1) Checkout session: "please give me a Stripe payment page for my order"
// ---------------------------------------------------------------------------------------
export async function createCheckoutSession(user, orderId) {
  assertCardPaymentsReady();

  // Filter by owner too: another customer's order id answers 404 (not 403), so nobody
  // can even learn that the id exists (see docs/concepts/14-authorization-ownership.md).
  const order = await Order.findOne({ _id: orderId, user: user._id });
  if (!order) throw new ApiError(404, 'Order not found');

  // Business checks, cheapest first. Each one blocks a way to pay for the wrong thing.
  if (order.paymentMethod !== PAYMENT_METHODS.CARD) {
    throw new ApiError(400, 'This order is not a card order');
  }
  if (order.paymentStatus === PAYMENT_STATUS.PAID) {
    throw new ApiError(400, 'This order is already paid');
  }
  if (order.status !== ORDER_STATUS.PENDING) {
    throw new ApiError(400, 'This order can no longer be paid');
  }
  // The expiry job may not have run yet, so we check the clock ourselves as well
  if (isPaymentWindowOver(order)) {
    throw new ApiError(400, 'The time to pay for this order is over, please order again');
  }

  let session;
  try {
    session = await stripeGateway.createCheckoutSession({
      mode: 'payment', // a one-time payment (not a subscription)
      customer_email: user.email, // pre-fills the email box on Stripe's page
      // ONE line with the server-calculated total. We never trust a price from the client.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: PAYMENTS.CURRENCY,
            unit_amount: toMinorUnits(order.totalPrice), // Rs 1,250 → 125000 paisa
            product_data: { name: `ShopEase order ${order.orderNumber}` },
          },
        },
      ],
      // Our own data travels with the payment and comes back in the webhook,
      // so the webhook can find the order even if saving the session id below failed.
      client_reference_id: String(order._id),
      metadata: { orderId: String(order._id) },
      // Where Stripe sends the customer afterwards (FRONTEND pages, not API routes).
      // These pages only SHOW status; landing on success_url does NOT mean "paid".
      success_url: `${env.FRONTEND_URL}/order-success/${order._id}`,
      cancel_url: `${env.FRONTEND_URL}/account/orders/${order._id}`,
    });
  } catch (err) {
    // Stripe down, bad key, network error… 502 = "the server behind me failed"
    console.error(`💳 Stripe checkout failed: ${err.message}`);
    throw new ApiError(502, 'Could not reach the payment provider, please try again');
  }

  // Remember the session id: the webhook looks the order up by it
  order.paymentResult = { provider: PAYMENTS.PROVIDER, sessionId: session.id };
  await order.save();
  // The frontend simply does: window.location.href = data.url
  return { url: session.url, sessionId: session.id };
}

// ---------------------------------------------------------------------------------------
// 2) Webhook: Stripe tells us "this checkout was paid"
// ---------------------------------------------------------------------------------------

/**
 * Verifies the signature, then reacts to the event. Returns a small summary object
 * (handy in logs and tests). Unknown or irrelevant events are ACKNOWLEDGED (200) and
 * ignored: if we answered with an error, Stripe would keep re-sending them for days.
 */
export async function handleWebhook(rawBody, signature) {
  // Without the signing secret we cannot tell real Stripe calls from fake ones → refuse all
  if (!env.STRIPE_WEBHOOK_SECRET) throw new ApiError(400, 'Stripe webhooks are not configured');
  if (!signature) throw new ApiError(400, 'Missing Stripe signature');

  let event;
  try {
    // Recomputes the HMAC signature over the RAW body with our secret and compares it to
    // the `Stripe-Signature` header. Any change to the body or a wrong secret → throws.
    event = stripeGateway.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    // 400 tells a faker nothing useful, and tells Stripe "your request was bad"
    throw new ApiError(400, 'Invalid Stripe signature');
  }

  // We only care about "the money arrived" events. Everything else: thanks, ignored.
  if (!PAYMENTS.PAID_EVENTS.includes(event.type)) {
    return { handled: false, reason: 'ignored-event-type', type: event.type };
  }
  const session = event.data.object; // the Checkout Session that changed
  // "completed" can also mean "the customer finished the form but a slow method (bank
  // debit) is still processing". Only payment_status "paid" means money is ours.
  if (session.payment_status !== 'paid') {
    return { handled: false, reason: 'not-paid-yet', type: event.type };
  }
  return { ...(await markOrderPaid(session)), type: event.type };
}

/**
 * Marks the order of a paid Checkout Session as paid. IDEMPOTENT: Stripe may deliver the
 * same event twice (or two events for one payment). Running this again changes nothing
 * and sends no second email.
 */
async function markOrderPaid(session) {
  // Find the order by the session id we saved, or by the orderId we put in metadata
  const lookups = [{ 'paymentResult.sessionId': session.id }];
  const metaId = session.metadata?.orderId;
  if (mongoose.isObjectIdOrHexString(metaId)) lookups.push({ _id: metaId });
  const order = await Order.findOne({ $or: lookups, paymentMethod: PAYMENT_METHODS.CARD });
  // Not ours (e.g. a test event from the Stripe CLI): acknowledge and move on
  if (!order) return { handled: false, reason: 'order-not-found' };
  // Fast path for a repeated delivery
  if (order.paymentStatus === PAYMENT_STATUS.PAID) {
    return { handled: false, reason: 'already-paid', orderId: String(order._id) };
  }

  // Trust, but verify: the amount Stripe charged must be exactly our total
  const expected = toMinorUnits(order.totalPrice);
  const wrongAmount = session.amount_total != null && session.amount_total !== expected;
  const wrongCurrency = session.currency && session.currency !== PAYMENTS.CURRENCY;
  if (wrongAmount || wrongCurrency) {
    console.error(`💳 Amount mismatch for order ${order.orderNumber}: needs manual review`);
    return { handled: false, reason: 'amount-mismatch', orderId: String(order._id) };
  }

  // ATOMIC "claim": the filter `paymentStatus: 'pending'` means that if two deliveries
  // arrive at the same moment, only ONE update matches; the other gets null and stops.
  // (A read-then-save would let both pass the check above and both send an email.)
  const paidAt = new Date();
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: PAYMENT_STATUS.PENDING },
    {
      $set: {
        paymentStatus: PAYMENT_STATUS.PAID,
        paidAt,
        paymentResult: {
          provider: PAYMENTS.PROVIDER,
          sessionId: session.id,
          paymentIntentId: session.payment_intent || undefined, // Stripe's id of the charge
          paidAt,
        },
      },
    },
    { new: true }, // return the document AFTER the update
  );
  if (!claimed) return { handled: false, reason: 'already-paid', orderId: String(order._id) };

  if (claimed.status === ORDER_STATUS.PENDING) {
    // Normal case: payment arrived in time → the order is confirmed (by "the system")
    claimed.changeStatus(ORDER_STATUS.CONFIRMED, { note: 'Card payment received' });
    await claimed.save();
    // The confirmation email of a card order is sent HERE, not when it was placed
    await sendOrderEmail(claimed, 'confirmation');
    return { handled: true, reason: 'paid', orderId: String(claimed._id) };
  }

  // Rare case: the order was already cancelled (e.g. expired) when the money arrived.
  // We record the payment so the admin can see it and refund it in the Stripe dashboard.
  console.warn(`💳 Order ${claimed.orderNumber} was paid after it was ${claimed.status}`);
  return { handled: true, reason: 'paid-after-cancel', orderId: String(claimed._id) };
}

// ---------------------------------------------------------------------------------------
// 3) Expiry job: cancel card orders nobody paid for
// ---------------------------------------------------------------------------------------

/**
 * Cancels CARD orders still unpaid after PAYMENTS.UNPAID_CARD_EXPIRY_MS and gives their
 * stock (and coupon use) back. Safe to run as often as you like.
 * `now` and `cancel` are parameters so tests can control time and simulate failures
 * ("dependency injection"); real callers pass nothing.
 */
export async function expireUnpaidOrders({ now = new Date(), cancel = cancelWithRestore } = {}) {
  const cutoff = new Date(now.getTime() - PAYMENTS.UNPAID_CARD_EXPIRY_MS);
  // Uses the order index { paymentMethod, paymentStatus, createdAt } → fast even with
  // millions of orders. We only need ids here.
  const stale = await Order.find({
    paymentMethod: PAYMENT_METHODS.CARD,
    paymentStatus: PAYMENT_STATUS.PENDING,
    status: ORDER_STATUS.PENDING,
    createdAt: { $lt: cutoff },
  })
    .select('_id')
    .lean();

  let cancelled = 0;
  let skipped = 0;
  // One by one (not Promise.all): each cancel is its own transaction, and a calm,
  // sequential job is kinder to the database than a burst of parallel transactions.
  for (const { _id } of stale) {
    try {
      // The filter repeats "still unpaid + pending": if the webhook paid this order a
      // millisecond ago, the cancel finds nothing (404) and we leave the paid order alone.
      await cancel(_id, {
        note: 'Payment not completed in time',
        filter: { paymentStatus: PAYMENT_STATUS.PENDING, status: ORDER_STATUS.PENDING },
      });
      cancelled += 1;
    } catch (err) {
      // One bad order must not stop the whole job; log it and continue with the next
      console.error(`⏰ Could not expire order ${_id}: ${err.message}`);
      skipped += 1;
    }
  }
  return { checked: stale.length, cancelled, skipped };
}
