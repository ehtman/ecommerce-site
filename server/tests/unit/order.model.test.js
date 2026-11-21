/**
 * UNIT tests for the Order model: the status STATE MACHINE (BR-08), customer cancel rule
 * (BR-06), money invariants (totals must add up), order numbers, snapshots, plus the pure
 * pricing helper and the order email templates.
 * No database needed: `validate()` / `validateSync()` run the schema rules in memory.
 */
import mongoose from 'mongoose';
import { Order, Address } from '../../src/modules/models.js';
import {
  ORDER_STATUS,
  ORDER_TRANSITIONS,
  CUSTOMER_CANCELLABLE,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
} from '../../src/config/constants.js';
import { calcTotals, calcShipping } from '../../src/utils/pricing.js';
import { orderConfirmationTemplate, orderStatusTemplate } from '../../src/emails/templates.js';

const ALL = Object.values(ORDER_STATUS);

// A valid in-memory order; override any field
const build = (overrides = {}) =>
  new Order({
    user: new mongoose.Types.ObjectId(),
    items: [
      {
        product: new mongoose.Types.ObjectId(),
        name: 'Mug',
        slug: 'mug',
        sku: 'MUG-1',
        image: 'https://res.cloudinary.com/demo/image/upload/mug.jpg',
        price: 1000,
        quantity: 2,
      },
    ],
    shippingAddress: {
      fullName: 'Ali Khan',
      phone: '03001234567',
      addressLine1: 'House 12, Street 4',
      city: 'Lahore',
      province: 'Punjab',
      postalCode: '54000',
    },
    ...calcTotals(2000),
    ...overrides,
  });

describe('Order state machine (BR-08)', () => {
  // Every (from, to) pair: allowed exactly when it is an arrow in ORDER_TRANSITIONS
  const pairs = ALL.flatMap((from) => ALL.map((to) => [from, to]));

  it.each(pairs)('%s → %s follows ORDER_TRANSITIONS', (from, to) => {
    const order = build({ status: from });
    expect(order.canTransitionTo(to)).toBe(ORDER_TRANSITIONS[from].includes(to));
  });

  it('has final states with no way out', () => {
    expect(ORDER_TRANSITIONS.delivered).toEqual([]);
    expect(ORDER_TRANSITIONS.cancelled).toEqual([]);
  });

  it('returns false for an unknown current status', () => {
    const order = build();
    order.status = 'teleported'; // not a real status (validation would refuse it)
    expect(order.canTransitionTo('confirmed')).toBe(false);
  });

  it('changeStatus refuses a move that is not an arrow (400)', () => {
    const order = build({ status: 'delivered' });
    expect(() => order.changeStatus('pending')).toThrow(
      'Cannot change status from delivered to pending',
    );
    let caught;
    try {
      order.changeStatus('pending');
    } catch (err) {
      caught = err;
    }
    expect(caught.statusCode).toBe(400); // an ApiError → the error handler answers 400
    expect(order.status).toBe('delivered'); // unchanged
  });

  it('changeStatus records history with who and why', () => {
    const order = build();
    const admin = new mongoose.Types.ObjectId();
    order.changeStatus('confirmed', { by: admin, note: 'Checked stock' });
    expect(order.status).toBe('confirmed');
    const last = order.statusHistory.at(-1);
    expect(last.status).toBe('confirmed');
    expect(last.note).toBe('Checked stock');
    expect(String(last.changedBy)).toBe(String(admin));
  });

  it('shipping stores the tracking number', () => {
    const order = build({ status: 'processing' });
    order.changeStatus('shipped', { trackingNumber: 'TCS123' });
    expect(order.trackingNumber).toBe('TCS123');
  });

  it('delivering a COD order marks it paid', () => {
    const order = build({ status: 'shipped', trackingNumber: 'TCS1' });
    order.changeStatus('delivered');
    expect(order.deliveredAt).toBeInstanceOf(Date);
    expect(order.paymentStatus).toBe(PAYMENT_STATUS.PAID);
    expect(order.paidAt).toBeInstanceOf(Date);
  });

  it('delivering a CARD order leaves payment to Stripe (branch 08)', () => {
    const order = build({
      status: 'shipped',
      trackingNumber: 'TCS1',
      paymentMethod: PAYMENT_METHODS.CARD,
    });
    order.changeStatus('delivered');
    expect(order.paymentStatus).toBe(PAYMENT_STATUS.PENDING);
    expect(order.paidAt).toBeUndefined();
  });

  it('cancelling stores the time and the reason', () => {
    const order = build();
    order.changeStatus('cancelled', { note: 'Changed my mind' });
    expect(order.cancelledAt).toBeInstanceOf(Date);
    expect(order.cancelReason).toBe('Changed my mind');
  });

  it.each(ALL)('customer may cancel while %s only if listed in CUSTOMER_CANCELLABLE', (s) => {
    expect(build({ status: s }).isCancellableByCustomer()).toBe(CUSTOMER_CANCELLABLE.includes(s));
  });
});

describe('Order schema rules', () => {
  it('accepts a valid order, numbers it and starts the history', async () => {
    const order = build();
    await expect(order.validate()).resolves.toBeUndefined();
    expect(order.orderNumber).toMatch(/^ORD-\d{8}-\d{5}$/);
    expect(order.status).toBe('pending');
    expect(order.paymentMethod).toBe('COD');
    expect(order.statusHistory).toHaveLength(1);
    expect(order.statusHistory[0].note).toBe('Order placed');
    expect(order.items[0].subtotal).toBe(2000); // price × quantity, calculated
  });

  it('keeps an existing order number', async () => {
    const order = build({ orderNumber: 'ORD-20260101-12345' });
    await order.validate();
    expect(order.orderNumber).toBe('ORD-20260101-12345');
  });

  it('recalculates a wrong item subtotal', async () => {
    const order = build();
    order.items[0].subtotal = 1; // a bug somewhere would be corrected
    await order.validate();
    expect(order.items[0].subtotal).toBe(2000);
  });

  it('refuses a total that does not add up', async () => {
    const order = build({ totalPrice: 1 });
    await expect(order.validate()).rejects.toThrow('Total does not match its parts');
  });

  it('refuses a discount larger than the items price', async () => {
    const order = build({ discountPrice: 3000, totalPrice: -750 });
    const err = await order.validate().catch((e) => e);
    expect(err.errors.discountPrice.message).toBe('Discount exceeds items price');
  });

  it('refuses an order without items, address or with a too large quantity', () => {
    const empty = build({ items: [] }).validateSync();
    expect(empty.errors.items.message).toBe('Order must have at least one item');
    const noAddress = build({ shippingAddress: undefined }).validateSync();
    expect(noAddress.errors.shippingAddress).toBeDefined();
    const big = build();
    big.items[0].quantity = 11;
    expect(big.validateSync().errors['items.0.quantity']).toBeDefined();
  });

  it('requires a tracking number once shipped', () => {
    const { errors } = build({ status: 'shipped' }).validateSync();
    expect(errors.trackingNumber.message).toBe('Tracking number is required when shipping');
  });

  it('refuses money that is not a whole number', () => {
    const { errors } = build({ shippingPrice: 2.5 }).validateSync();
    expect(errors.shippingPrice.message).toBe('shippingPrice must be a whole number');
  });
});

describe('Address.toSnapshot()', () => {
  it('copies only the delivery fields', () => {
    const address = new Address({
      user: new mongoose.Types.ObjectId(),
      label: 'Work',
      fullName: 'Ali Khan',
      phone: '03001234567',
      addressLine1: 'House 12, Street 4',
      addressLine2: 'Near the park',
      city: 'Lahore',
      province: 'Punjab',
      postalCode: '54000',
      isDefault: true,
    });
    const snap = address.toSnapshot();
    expect(snap).toEqual({
      fullName: 'Ali Khan',
      phone: '03001234567',
      addressLine1: 'House 12, Street 4',
      addressLine2: 'Near the park',
      city: 'Lahore',
      province: 'Punjab',
      postalCode: '54000',
      country: 'Pakistan',
    });
    expect(snap).not.toHaveProperty('_id');
    expect(snap).not.toHaveProperty('user');
  });
});

describe('Order totals (utils/pricing.js, BR-02/BR-03)', () => {
  it.each([
    [1000, 0, { shippingPrice: 250, totalPrice: 1250 }],
    [4999, 0, { shippingPrice: 250, totalPrice: 5249 }],
    [5000, 0, { shippingPrice: 0, totalPrice: 5000 }], // free shipping from Rs 5,000
    [6000, 1500, { shippingPrice: 250, totalPrice: 4750 }], // the discount counts first
    [0, 0, { shippingPrice: 0, totalPrice: 0 }],
  ])('items %i − discount %i', (items, discount, expected) => {
    const totals = calcTotals(items, discount);
    expect(totals).toMatchObject({ itemsPrice: items, discountPrice: discount, taxPrice: 0 });
    expect(totals).toMatchObject(expected);
  });

  it('charges no shipping for an empty amount', () => {
    expect(calcShipping(0)).toBe(0);
  });
});

describe('Order email templates', () => {
  const order = () => {
    const o = build({ note: 'x' });
    o.orderNumber = 'ORD-20260101-11111';
    return o;
  };

  it('confirmation lists items, totals and the escaped address', () => {
    const o = order();
    o.items[0].name = '<b>Mug</b>';
    o.shippingAddress.addressLine2 = 'Flat <2>';
    o.discountPrice = 0;
    const mail = orderConfirmationTemplate('<script>', o);
    expect(mail.subject).toBe('Order ORD-20260101-11111 confirmed');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('&lt;b&gt;Mug&lt;/b&gt;');
    expect(mail.html).toContain('Flat &lt;2&gt;');
    expect(mail.html).toContain('Cash on Delivery');
    expect(mail.html).toContain('Rs 2,250');
    expect(mail.text).toContain('Total Rs 2,250');
  });

  it('confirmation shows a discount, free shipping and card payment', () => {
    const o = build({ paymentMethod: 'CARD', ...calcTotals(6000, 500) });
    o.items[0].quantity = 6;
    const mail = orderConfirmationTemplate('Ali', o);
    expect(mail.html).toContain('- Rs 500');
    expect(mail.html).toContain('Free');
    expect(mail.html).toContain('Card');
  });

  it('status mail mentions tracking for shipped and reason for cancelled', () => {
    const shipped = build({ status: 'shipped', trackingNumber: 'TCS<1>' });
    expect(orderStatusTemplate('Ali', shipped).html).toContain('TCS&lt;1&gt;');
    const cancelled = build({ status: 'cancelled', cancelReason: 'Out of town' });
    const mail = orderStatusTemplate('Ali', cancelled);
    expect(mail.subject).toContain('has been cancelled');
    expect(mail.html).toContain('Reason: Out of town');
  });

  it('status mail falls back to "was updated" for other statuses', () => {
    expect(orderStatusTemplate('Ali', build()).subject).toContain('was updated');
  });
});
