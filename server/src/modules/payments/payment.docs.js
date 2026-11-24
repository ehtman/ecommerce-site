/**
 * src/modules/payments/payment.docs.js – OpenAPI description of the /payments routes.
 * Merged into the full spec by src/docs/openapi.js. Keep it in sync with payment.routes.js
 * and with the webhook line in app.js.
 */
import { PAYMENTS } from '../../config/constants.js';

// Small helpers so each route below stays short and readable (same as address.docs.js)
const json = (schema) => ({ content: { 'application/json': { schema } } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const err = (name) => ({ $ref: `#/components/responses/${name}` });
const secured = [{ bearerAuth: [] }]; // marks a route as "needs a token"
const errorBody = (description) => ({ description, ...json(ref('Error')) });

// Success envelope around any `data` schema
const envelope = (data) =>
  json({
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string' },
      data,
    },
  });

// Security scheme used only by the cron route: a shared secret in a header
const cronSecured = [{ cronSecret: [] }];

const expireSummary = envelope({
  type: 'object',
  properties: {
    checked: { type: 'integer', example: 3, description: 'Stale unpaid card orders found' },
    cancelled: { type: 'integer', example: 3, description: 'Cancelled, stock restored' },
    skipped: { type: 'integer', example: 0, description: 'Paid meanwhile or failed (logged)' },
  },
});

const expireOperation = (method) => ({
  tags: ['Payments'],
  summary: `Expire unpaid card orders (scheduler only)${method === 'post' ? ' – POST variant' : ''}`,
  description: `Cancels CARD orders still unpaid ${PAYMENTS.UNPAID_CARD_EXPIRY_MS / 60000} minutes after they were placed and puts their stock (and coupon use) back. Called by Vercel Cron (\`Authorization: Bearer <CRON_SECRET>\`) or any scheduler sending \`x-cron-secret\`.`,
  security: cronSecured,
  responses: {
    200: { description: 'Job finished', ...expireSummary },
    401: errorBody('No cron secret sent'),
    403: errorBody('Wrong cron secret (or none configured on the server)'),
  },
});

export default {
  // Added to components.securitySchemes by openapi.js
  securitySchemes: {
    cronSecret: { type: 'apiKey', in: 'header', name: 'x-cron-secret' },
  },
  tags: [
    {
      name: 'Payments',
      description:
        'Card payments with Stripe hosted Checkout. Only the signed Stripe webhook can mark an order paid.',
    },
  ],
  paths: {
    '/payments/checkout-session': {
      post: {
        tags: ['Payments'],
        summary: 'Get a Stripe Checkout URL for my unpaid CARD order',
        description:
          'The amount comes from the order in the database, never from the client. Redirect the browser to `data.url`. Returning to the success page does NOT mark the order paid; the webhook does.',
        security: secured,
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['orderId'],
            properties: { orderId: { type: 'string', example: '665f1c2e9b1e8a0012345678' } },
          }),
        },
        responses: {
          200: {
            description: 'Checkout session created',
            ...envelope({
              type: 'object',
              properties: {
                url: { type: 'string', example: 'https://checkout.stripe.com/c/pay/cs_test_123' },
                sessionId: { type: 'string', example: 'cs_test_123' },
              },
            }),
          },
          400: errorBody(
            'Invalid order id, card payments off, not a card order, already paid, not pending or payment time over',
          ),
          401: err('Unauthorized'),
          403: errorBody('Not a customer, or email not verified'),
          404: err('NotFound'),
          502: errorBody('Stripe could not be reached'),
        },
      },
    },
    '/payments/webhook': {
      post: {
        tags: ['Payments'],
        summary: 'Stripe webhook (called by Stripe, not by the frontend)',
        description:
          'Body must be the raw JSON Stripe sent, with the `Stripe-Signature` header. Handles `checkout.session.completed` and `checkout.session.async_payment_succeeded`; other events are acknowledged and ignored. Repeated events are harmless (idempotent).',
        parameters: [
          {
            name: 'Stripe-Signature',
            in: 'header',
            required: true,
            schema: { type: 'string', example: 't=1700000000,v1=5257a869e7…' },
          },
        ],
        requestBody: { required: true, ...json({ type: 'object' }) },
        responses: {
          200: {
            description: 'Event received (handled or ignored)',
            ...envelope({
              type: 'object',
              properties: {
                received: { type: 'boolean', example: true },
                handled: { type: 'boolean' },
                reason: {
                  type: 'string',
                  enum: [
                    'paid',
                    'paid-after-cancel',
                    'already-paid',
                    'order-not-found',
                    'amount-mismatch',
                    'not-paid-yet',
                    'ignored-event-type',
                  ],
                },
                type: { type: 'string', example: 'checkout.session.completed' },
                orderId: { type: 'string' },
              },
            }),
          },
          400: errorBody('Missing or invalid signature, or webhooks not configured'),
        },
      },
    },
    '/payments/expire-unpaid': {
      get: expireOperation('get'),
      post: expireOperation('post'),
    },
  },
};
