/**
 * src/modules/orders/order.service.js – business logic for orders: checkout, reading,
 * cancelling and the admin's status changes.
 *
 * Layers: routes → controller → SERVICE → models. No req/res here; errors are ApiErrors.
 *
 * This is the hardest module of the course, because placing an order changes FOUR
 * collections at once:
 *   1. Product  – take the stock ("reserve" it)
 *   2. Coupon   – count one more use
 *   3. Order    – create the receipt
 *   4. Cart     – empty it
 * If step 3 failed after steps 1–2 succeeded, the shop would lose stock that nobody bought.
 * So all four run inside ONE MongoDB TRANSACTION: either every write is kept (commit) or
 * every write is undone (abort / rollback). That is the "A" (Atomicity) of ACID.
 * See docs/concepts/20-transactions-and-race-conditions.md.
 *
 * The second big idea is the RACE CONDITION: two customers press "Place order" for the last
 * unit at the same moment. "Read the stock, then write stock − 1" in two steps would let
 * BOTH see stock 1 and BOTH buy it. Product.reserveStock() instead does ONE atomic
 * conditional update ("decrease ONLY IF stock >= qty"), so only one of them can win.
 */
import mongoose from 'mongoose';
import env from '../../config/env.js';
import { Order, Cart, Product, Address, Coupon, User } from '../models.js';
import ApiError from '../../utils/ApiError.js';
import { calcTotals } from '../../utils/pricing.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import {
  ORDER_STATUS,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
  LIMITS,
  ROLES,
} from '../../config/constants.js';
import sendEmail from '../../emails/sendEmail.js';
import { orderConfirmationTemplate, orderStatusTemplate } from '../../emails/templates.js';

// One message for "does not exist" AND "belongs to someone else" (no IDOR information leak)
const notFound = () => new ApiError(404, 'Order not found');

/* ====================================================================================
 * Emails – always sent AFTER the database work has been committed.
 * Sending inside the transaction would be wrong: if the transaction then rolled back,
 * the customer would already have an email for an order that does not exist.
 * ==================================================================================== */
export async function sendOrderEmail(order, type = 'status') {
  // Read the customer's CURRENT name and email (they are not part of the snapshot)
  const user = await User.findById(order.user).select('name email').lean();
  if (!user) return; // account deleted meanwhile: nobody to write to
  const template =
    type === 'confirmation'
      ? orderConfirmationTemplate(user.name, order)
      : orderStatusTemplate(user.name, order);
  await sendEmail({ to: user.email, ...template });
}

/* ====================================================================================
 * Place an order (checkout)
 * ==================================================================================== */

/**
 * One attempt at placing an order. Everything inside withTransaction() is all-or-nothing.
 * @returns {Promise<import('mongoose').Document>} the new order
 */
async function placeOrderOnce(userId, { addressId, paymentMethod, couponCode, note }) {
  // Ownership: the address must be MINE. A foreign id finds nothing → 404 (no IDOR).
  const address = await Address.findOne({ _id: addressId, user: userId });
  if (!address) throw new ApiError(404, 'Address not found');

  // A session groups several operations into one transaction
  const session = await mongoose.startSession();
  let order;
  try {
    // withTransaction(): start → run our function → COMMIT. If the function throws, it
    // ABORTS (every write below is undone). If MongoDB reports a temporary conflict (two
    // transactions touched the same document), it RETRIES the whole function, so all the
    // variables below are rebuilt from scratch on each try.
    await session.withTransaction(async () => {
      // Read the cart INSIDE the transaction (`.session(session)`), with full products
      const cart = await Cart.findOne({ user: userId }).populate('items.product').session(session);
      if (!cart || cart.items.length === 0) throw new ApiError(400, 'Your cart is empty');

      const items = []; // the snapshot lines of the new order
      const problems = []; // every line we could not sell, reported together
      for (const line of cart.items) {
        const p = line.product; // null when the product was deleted
        if (!p || !p.isActive) {
          problems.push({
            product: p?._id,
            name: p?.name,
            reason: 'This product is no longer available',
          });
          continue;
        }
        // BR-04: never more than MAX_CART_QTY of one product per order
        if (line.quantity > LIMITS.MAX_CART_QTY) {
          problems.push({
            product: p._id,
            name: p.name,
            reason: `You can buy at most ${LIMITS.MAX_CART_QTY} of one product`,
          });
          continue;
        }
        // ATOMIC check-and-decrease (see product.model.js reserveStock):
        //   updateOne({ _id, stock: { $gte: qty } }, { $inc: { stock: -qty } })
        // The check and the write are ONE database operation, so two buyers can never
        // both take the last unit. `false` means "not enough stock right now".
        const reserved = await Product.reserveStock(p._id, line.quantity, session);
        if (!reserved) {
          problems.push({
            product: p._id,
            name: p.name,
            reason: `Only ${p.stock} left in stock`,
            available: p.stock,
          });
          continue;
        }
        // SNAPSHOT: copy today's name/price/image into the order. If the admin changes the
        // price tomorrow, this receipt still shows what the customer really paid.
        items.push({
          product: p._id,
          name: p.name,
          slug: p.slug,
          sku: p.sku,
          image: p.images[0]?.url,
          price: p.price,
          quantity: line.quantity,
          subtotal: p.price * line.quantity,
        });
      }
      // Throwing here aborts the transaction → stock already reserved above is given back
      if (problems.length) {
        throw new ApiError(409, 'Some items in your cart are unavailable', problems);
      }

      // The items total, calculated on the server from the snapshot prices
      const itemsPrice = items.reduce((sum, i) => sum + i.subtotal, 0);

      // The coupon is checked AGAIN here: it may have expired or been used up since the
      // customer previewed it. Never trust an earlier check.
      let couponSnapshot;
      let discount = 0;
      if (couponCode) {
        const coupon = await Coupon.findOne({
          code: String(couponCode).toUpperCase().trim(),
        }).session(session);
        if (!coupon) throw new ApiError(400, 'Coupon not found');
        const check = coupon.checkUsable(itemsPrice); // active, dates, limit, minimum order
        if (!check.ok) throw new ApiError(400, check.reason);
        // ATOMIC "+1 use, only if still under the usage limit" (same idea as reserveStock)
        const used = await Coupon.consume(coupon._id, session);
        if (!used) throw new ApiError(400, 'Coupon usage limit reached');
        discount = coupon.calculateDiscount(itemsPrice);
        // Snapshot of the coupon, so the receipt survives the coupon being edited/deleted
        couponSnapshot = {
          coupon: coupon._id,
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
          discount,
        };
      }

      // Shipping and total also come from the server (BR-02, BR-03)
      const totals = calcTotals(itemsPrice, discount);
      // Model.create([doc], { session }) – the array form is required to pass options
      [order] = await Order.create(
        [
          {
            user: userId, // the owner always comes from the token
            items,
            shippingAddress: address.toSnapshot(), // a COPY, not a link
            paymentMethod,
            coupon: couponSnapshot,
            ...totals,
            note,
          },
        ],
        { session },
      );

      // Finally empty the cart. Part of the same transaction, so a failed order keeps it.
      cart.items = [];
      await cart.save({ session });
    });
  } finally {
    // Always release the session, success or failure (like closing a file)
    await session.endSession();
  }
  return order;
}

/**
 * POST /api/orders – turns the customer's cart into an order.
 * @param {*} userId  the logged-in customer
 * @param {{addressId: string, paymentMethod?: string, couponCode?: string, note?: string}} body
 */
export async function placeOrder(userId, body) {
  const paymentMethod = body.paymentMethod || PAYMENT_METHODS.COD; // COD is the default
  // Branch 08: card payments go through Stripe. Until the flag is on, refuse them early.
  if (paymentMethod === PAYMENT_METHODS.CARD && !env.PAYMENT_CARD_ENABLED) {
    throw new ApiError(400, 'Card payments are not available right now');
  }
  let order;
  try {
    order = await placeOrderOnce(userId, { ...body, paymentMethod });
  } catch (err) {
    // Very rare: the random order number already exists (error 11000 on orderNumber).
    // The whole transaction was rolled back, so it is safe to simply try once more.
    if (err.code === 11000 && err.keyValue?.orderNumber) {
      order = await placeOrderOnce(userId, { ...body, paymentMethod });
    } else {
      throw err; // every other error goes to the error handler unchanged
    }
  }
  // Branch 08: card orders get their confirmation email when Stripe confirms the payment
  if (order.paymentMethod === PAYMENT_METHODS.COD) await sendOrderEmail(order, 'confirmation');
  return order;
}

/* ====================================================================================
 * Read
 * ==================================================================================== */

/** GET /api/orders/my – my orders, newest first, paginated, optional ?status filter. */
export async function getMyOrders(userId, query) {
  const { page, limit, skip } = getPagination(query, 10, 50);
  const filter = { user: userId }; // ownership IS the filter
  if (Object.values(ORDER_STATUS).includes(query.status)) filter.status = query.status;
  // Both queries at the same time (they do not depend on each other)
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1, _id: -1 }) // _id breaks ties between same-millisecond orders
      .skip(skip)
      .limit(limit)
      // A list needs only a summary; the full order is one click away
      .select('orderNumber items totalPrice status paymentMethod paymentStatus createdAt')
      .lean(),
    Order.countDocuments(filter),
  ]);
  return { data: orders, meta: buildMeta(page, limit, total) };
}

/**
 * GET /api/orders/:id – the owner OR an admin may read an order.
 * Other customers get 404 (not 403), so nobody can even tell whether the id exists.
 */
export async function getOrderById(user, id) {
  const filter = user.role === ROLES.ADMIN ? { _id: id } : { _id: id, user: user._id };
  const order = await Order.findOne(filter)
    .populate('user', 'name email phone') // who ordered (for the admin view)
    .populate('statusHistory.changedBy', 'name role'); // who changed each status
  if (!order) throw notFound();
  return order;
}

/* ====================================================================================
 * Cancel – shared by the customer and the admin
 * ==================================================================================== */

/**
 * Cancels an order AND gives back what it took (stock + coupon use), in one transaction.
 * The state machine (changeStatus) runs INSIDE the transaction on a fresh copy of the
 * order. That makes cancelling IDEMPOTENT-safe: if two cancel requests race, the second
 * one sees "cancelled" and changeStatus refuses it, so stock is never given back twice.
 * @param {*} orderId
 * @param {{by?: any, note?: string, filter?: object}} [options]  `filter` adds conditions
 *        such as { user: customerId } (ownership)
 */
export async function cancelWithRestore(orderId, { by = null, note, filter = {} } = {}) {
  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      order = await Order.findOne({ _id: orderId, ...filter }).session(session);
      if (!order) throw notFound();
      order.changeStatus(ORDER_STATUS.CANCELLED, { by, note }); // throws 400 if not allowed
      // Branch 08: a paid card order is marked refunded (the refund itself is done in Stripe)
      if (order.paymentStatus === PAYMENT_STATUS.PAID) {
        order.paymentStatus = PAYMENT_STATUS.REFUNDED;
      }
      // BR-05: put every unit back on the shelf
      for (const item of order.items) {
        await Product.releaseStock(item.product, item.quantity, session);
      }
      // Give the coupon use back, so the customer (or someone else) may use it again
      if (order.coupon?.coupon) await Coupon.release(order.coupon.coupon, session);
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }
  await sendOrderEmail(order); // "Your order … has been cancelled"
  return order;
}

/** PATCH /api/orders/:id/cancel – the customer cancels their own order (BR-06). */
export async function cancelMyOrder(userId, orderId, reason) {
  // Ownership check first: someone else's order → 404
  const order = await Order.findOne({ _id: orderId, user: userId }).select('status');
  if (!order) throw notFound();
  // BR-06: customers may cancel only while pending or confirmed
  if (!order.isCancellableByCustomer()) {
    throw new ApiError(400, `Orders that are ${order.status} can no longer be cancelled`);
  }
  return cancelWithRestore(orderId, {
    by: userId,
    note: reason || 'Cancelled by customer',
    filter: { user: userId }, // ownership is checked AGAIN inside the transaction
  });
}

/* ====================================================================================
 * Admin
 * ==================================================================================== */

// Makes user text safe inside a RegExp: "a.b" must match a dot, not "any character"
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** GET /api/admin/orders – every order, with filters (status, payment, dates, search). */
export async function adminListOrders(query) {
  const { page, limit, skip } = getPagination(query, 20, 100);
  const filter = {};
  if (Object.values(ORDER_STATUS).includes(query.status)) filter.status = query.status;
  if (Object.values(PAYMENT_STATUS).includes(query.paymentStatus)) {
    filter.paymentStatus = query.paymentStatus;
  }
  // Date range on createdAt. `to` includes the WHOLE day (until 23:59:59.999 UTC).
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(`${query.to.slice(0, 10)}T23:59:59.999Z`);
  }
  // Search by order number OR by the customer's email
  if (query.search) {
    const rx = new RegExp(escapeRegex(String(query.search).trim()), 'i');
    const users = await User.find({ email: rx }).select('_id').lean();
    filter.$or = [{ orderNumber: rx }, { user: { $in: users.map((u) => u._id) } }];
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        'orderNumber user totalPrice status paymentMethod paymentStatus createdAt items.quantity',
      )
      .populate('user', 'name email')
      .lean(),
    Order.countDocuments(filter),
  ]);
  return { data: orders, meta: buildMeta(page, limit, total) };
}

/**
 * PATCH /api/admin/orders/:id/status – the admin moves an order along the state machine.
 * Cancelling also restores stock and coupon (cancelWithRestore). Other moves only change
 * the status; changeStatus() refuses any move that is not allowed (BR-08).
 */
export async function adminUpdateStatus(adminId, id, { status, note, trackingNumber }) {
  if (status === ORDER_STATUS.CANCELLED) {
    // Check the arrow first, for a clear 404/400 before starting a transaction
    const current = await Order.findById(id).select('status');
    if (!current) throw notFound();
    if (!current.canTransitionTo(ORDER_STATUS.CANCELLED)) {
      throw new ApiError(400, `Cannot change status from ${current.status} to cancelled`);
    }
    return cancelWithRestore(id, { by: adminId, note: note || 'Cancelled by store' });
  }

  const order = await Order.findById(id);
  if (!order) throw notFound();
  // A parcel cannot be tracked without a tracking number
  if (status === ORDER_STATUS.SHIPPED && !trackingNumber) {
    throw new ApiError(400, 'Tracking number is required when shipping', [
      { field: 'trackingNumber', message: 'Tracking number is required' },
    ]);
  }
  // changeStatus refuses invalid moves, sets deliveredAt and marks COD as paid on delivery
  order.changeStatus(status, { by: adminId, note, trackingNumber });
  await order.save();

  // "Processing" is an internal step; the customer is emailed about the others
  if (status !== ORDER_STATUS.PROCESSING) await sendOrderEmail(order);
  return order;
}
