/**
 * src/modules/orders/order.docs.js – OpenAPI description of the /orders and /admin/orders
 * routes. Merged into the full spec by src/docs/openapi.js (paths, tags AND schemas).
 * Keep it in sync with order.routes.js.
 */
import {
  ORDER_STATUS,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
  ORDER_TRANSITIONS,
  CUSTOMER_CANCELLABLE,
  PROVINCES,
} from '../../config/constants.js';

// Small helpers so each route below stays short and readable (same as address.docs.js)
const json = (schema) => ({ content: { 'application/json': { schema } } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const err = (name) => ({ $ref: `#/components/responses/${name}` });
const secured = [{ bearerAuth: [] }];

// Success envelope around any `data` schema (+ optional pagination meta)
const envelope = (data, withMeta = false) =>
  json({
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string' },
      data,
      ...(withMeta && { meta: ref('PageMeta') }),
    },
  });
const oneOrder = envelope(ref('Order'));
const orderList = envelope({ type: 'array', items: ref('OrderSummary') }, true);

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Order id (24-character ObjectId)',
  schema: { type: 'string', example: '665f1c2e9b1e8a0012345680' },
};
const q = (name, description, schema = { type: 'string' }) => ({
  name,
  in: 'query',
  required: false,
  description,
  schema,
});
const pageParams = [
  q('page', 'Page number (default 1)', { type: 'integer', minimum: 1 }),
  q('limit', 'Items per page', { type: 'integer', minimum: 1 }),
  q('status', 'Only orders in this status', { type: 'string', enum: Object.values(ORDER_STATUS) }),
];

// Human-readable list of the state machine arrows for the description text
const arrows = Object.entries(ORDER_TRANSITIONS)
  .map(([from, to]) => `${from} → ${to.length ? to.join(' | ') : '(final)'}`)
  .join('; ');

/* ---------- Reusable schemas ---------- */
const money = { type: 'integer', description: 'Whole rupees' };
// PageMeta is the shared schema from docs/openapi.js (branch 04)
const schemas = {
  OrderItem: {
    type: 'object',
    description: 'Snapshot of the product at checkout time',
    properties: {
      product: { type: 'string', description: 'Product id' },
      name: { type: 'string', example: 'Wireless Mouse' },
      slug: { type: 'string', example: 'wireless-mouse' },
      sku: { type: 'string', example: 'WM-001' },
      image: { type: 'string', example: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' },
      price: { ...money, example: 1500 },
      quantity: { type: 'integer', example: 2 },
      subtotal: { ...money, example: 3000 },
    },
  },
  ShippingAddress: {
    type: 'object',
    description: 'Copy of the chosen address (later edits do not change it)',
    properties: {
      fullName: { type: 'string', example: 'Ali Khan' },
      phone: { type: 'string', example: '03001234567' },
      addressLine1: { type: 'string', example: 'House 12, Street 4, Gulberg III' },
      addressLine2: { type: 'string' },
      city: { type: 'string', example: 'Lahore' },
      province: { type: 'string', enum: [...PROVINCES] },
      postalCode: { type: 'string', example: '54000' },
      country: { type: 'string', example: 'Pakistan' },
    },
  },
  OrderSummary: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      orderNumber: { type: 'string', example: 'ORD-20261117-48213' },
      totalPrice: money,
      status: { type: 'string', enum: Object.values(ORDER_STATUS) },
      paymentMethod: { type: 'string', enum: Object.values(PAYMENT_METHODS) },
      paymentStatus: { type: 'string', enum: Object.values(PAYMENT_STATUS) },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  Order: {
    type: 'object',
    properties: {
      _id: { type: 'string', example: '665f1c2e9b1e8a0012345680' },
      orderNumber: { type: 'string', example: 'ORD-20261117-48213' },
      user: { description: 'Owner id (populated with name/email/phone on GET /orders/{id})' },
      items: { type: 'array', items: ref('OrderItem') },
      shippingAddress: ref('ShippingAddress'),
      paymentMethod: { type: 'string', enum: Object.values(PAYMENT_METHODS) },
      paymentStatus: { type: 'string', enum: Object.values(PAYMENT_STATUS) },
      coupon: {
        type: 'object',
        description: 'Snapshot of the coupon used (absent when none)',
        properties: {
          coupon: { type: 'string' },
          code: { type: 'string', example: 'SAVE10' },
          type: { type: 'string', enum: ['percentage', 'fixed'] },
          value: { type: 'integer' },
          discount: money,
        },
      },
      itemsPrice: { ...money, example: 3000 },
      discountPrice: { ...money, example: 0 },
      shippingPrice: { ...money, example: 250 },
      taxPrice: { ...money, example: 0 },
      totalPrice: { ...money, example: 3250 },
      status: { type: 'string', enum: Object.values(ORDER_STATUS) },
      statusHistory: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: Object.values(ORDER_STATUS) },
            note: { type: 'string' },
            changedBy: { description: 'User id (populated with name/role)' },
            at: { type: 'string', format: 'date-time' },
          },
        },
      },
      trackingNumber: { type: 'string', example: 'TCS123456' },
      note: { type: 'string' },
      cancelReason: { type: 'string' },
      paidAt: { type: 'string', format: 'date-time' },
      deliveredAt: { type: 'string', format: 'date-time' },
      cancelledAt: { type: 'string', format: 'date-time' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
};

/* ---------- Common error sets ---------- */
const customerGuard = {
  401: err('Unauthorized'),
  403: { description: 'Not a customer (admins cannot buy)', ...json(ref('Error')) },
};
const adminGuard = {
  401: err('Unauthorized'),
  403: { description: 'Admins only', ...json(ref('Error')) },
};

export default {
  schemas,
  tags: [
    {
      name: 'Orders',
      description:
        'Checkout (one MongoDB transaction: stock, coupon, order and cart change together) and order history',
    },
    { name: 'Admin – Orders', description: `Every order and its status. Allowed moves: ${arrows}` },
  ],
  paths: {
    '/orders': {
      post: {
        tags: ['Orders'],
        summary: 'Place an order from my cart (verified email required)',
        description:
          'The server reads the cart, reserves stock atomically, re-checks the coupon and calculates every price. CARD orders are refused while PAYMENT_CARD_ENABLED is off; paid ones are confirmed by the Stripe webhook (POST /api/payments/webhook).',
        security: secured,
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['addressId'],
            properties: {
              addressId: { type: 'string', description: 'One of MY saved addresses' },
              paymentMethod: {
                type: 'string',
                enum: Object.values(PAYMENT_METHODS),
                default: PAYMENT_METHODS.COD,
              },
              couponCode: { type: 'string', example: 'SAVE10' },
              note: { type: 'string', example: 'Please call before delivery', maxLength: 300 },
            },
          }),
        },
        responses: {
          201: { description: 'Order placed successfully', ...oneOrder },
          400: {
            description: 'Validation failed, empty cart, coupon not usable, or card disabled',
            ...json(ref('Error')),
          },
          401: err('Unauthorized'),
          403: {
            description: 'Not a customer, or email not verified yet',
            ...json(ref('Error')),
          },
          404: { description: 'Address not found (or not mine)', ...json(ref('Error')) },
          409: {
            description: 'Some cart items are unavailable / out of stock (errors lists them)',
            ...json(ref('Error')),
          },
        },
      },
    },
    '/orders/my': {
      get: {
        tags: ['Orders'],
        summary: 'My orders (newest first, paginated)',
        security: secured,
        parameters: pageParams,
        responses: {
          200: { description: 'Orders fetched', ...orderList },
          400: err('BadRequest'),
          ...customerGuard,
        },
      },
    },
    '/orders/{id}': {
      get: {
        tags: ['Orders'],
        summary: 'One order (its owner or an admin)',
        security: secured,
        parameters: [idParam],
        responses: {
          200: { description: 'Order fetched', ...oneOrder },
          400: err('BadRequest'),
          401: err('Unauthorized'),
          404: err('NotFound'),
        },
      },
    },
    '/orders/{id}/cancel': {
      patch: {
        tags: ['Orders'],
        summary: `Cancel my order (only while ${CUSTOMER_CANCELLABLE.join(' or ')}); stock and coupon use are given back`,
        security: secured,
        parameters: [idParam],
        requestBody: {
          required: false,
          ...json({
            type: 'object',
            properties: {
              reason: { type: 'string', maxLength: 200, example: 'Ordered by mistake' },
            },
          }),
        },
        responses: {
          200: { description: 'Order cancelled', ...oneOrder },
          400: { description: 'Invalid id, or too late to cancel', ...json(ref('Error')) },
          ...customerGuard,
          404: err('NotFound'),
        },
      },
    },
    '/admin/orders': {
      get: {
        tags: ['Admin – Orders'],
        summary: 'All orders with filters',
        security: secured,
        parameters: [
          ...pageParams,
          q('paymentStatus', 'Only this payment status', {
            type: 'string',
            enum: Object.values(PAYMENT_STATUS),
          }),
          q('from', 'Created on/after this date (YYYY-MM-DD)', { type: 'string', format: 'date' }),
          q('to', 'Created on/before this date (YYYY-MM-DD)', { type: 'string', format: 'date' }),
          q('search', 'Order number or customer email (partial match)'),
        ],
        responses: {
          200: { description: 'Orders fetched', ...orderList },
          400: err('BadRequest'),
          ...adminGuard,
        },
      },
    },
    '/admin/orders/{id}/status': {
      patch: {
        tags: ['Admin – Orders'],
        summary: 'Move an order to its next status (cancel restores stock and coupon)',
        description: `Allowed moves (BR-08): ${arrows}. Shipping needs a trackingNumber.`,
        security: secured,
        parameters: [idParam],
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['status'],
            properties: {
              status: { type: 'string', enum: Object.values(ORDER_STATUS) },
              note: { type: 'string', maxLength: 200 },
              trackingNumber: { type: 'string', maxLength: 50, example: 'TCS123456' },
            },
          }),
        },
        responses: {
          200: { description: 'Order marked as <status>', ...oneOrder },
          400: {
            description: 'Validation failed, move not allowed, or tracking number missing',
            ...json(ref('Error')),
          },
          ...adminGuard,
          404: err('NotFound'),
        },
      },
    },
  },
};
