/**
 * src/modules/coupons/coupon.docs.js – OpenAPI description of the /coupons routes.
 * Merged into the full spec by src/docs/openapi.js. Keep it in sync with coupon.routes.js.
 */
import { COUPON_TYPES, LIMITS } from '../../config/constants.js';

// Small helpers so each route below stays short and readable (same as address.docs.js)
const json = (schema) => ({ content: { 'application/json': { schema } } });
const err = (name) => ({ $ref: `#/components/responses/${name}` });
const errorBody = (description) => ({
  description,
  ...json({ $ref: '#/components/schemas/Error' }),
});
const secured = [{ bearerAuth: [] }]; // marks a route as "needs a token"

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

// A coupon as the API returns it (defined here and registered under components.schemas)
const Coupon = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '665f1c2e9b1e8a00123456aa' },
    code: { type: 'string', example: 'EID25', description: 'Always UPPERCASE' },
    description: { type: 'string', example: 'Eid sale: 25% off, max Rs 2,000' },
    type: { type: 'string', enum: Object.values(COUPON_TYPES) },
    value: { type: 'integer', example: 25, description: 'Percent (1–90) or whole rupees' },
    maxDiscount: { type: 'integer', example: 2000, description: 'Cap for percentage coupons' },
    minOrderAmount: { type: 'integer', example: 3000 },
    startsAt: { type: 'string', format: 'date-time' },
    expiresAt: { type: 'string', format: 'date-time' },
    usageLimit: { type: 'integer', nullable: true, example: 100, description: 'null = unlimited' },
    usedCount: { type: 'integer', example: 0 },
    isActive: { type: 'boolean' },
    state: {
      type: 'string',
      enum: ['active', 'scheduled', 'expired', 'disabled', 'used-up'],
      description: 'Computed from isActive, the dates and the usage counter',
    },
    createdBy: { type: 'string', description: 'Admin id' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};
const ref = { $ref: '#/components/schemas/Coupon' };

// What the admin form sends (create AND replace)
const couponInput = {
  required: true,
  ...json({
    type: 'object',
    required: ['code', 'type', 'value', 'expiresAt'],
    properties: {
      code: { type: 'string', example: 'EID25', description: '3–20 letters/digits (uppercased)' },
      description: { type: 'string', example: 'Eid sale', maxLength: 150 },
      type: { type: 'string', enum: Object.values(COUPON_TYPES) },
      value: {
        type: 'integer',
        example: 25,
        description: `percentage: 1–${LIMITS.COUPON_MAX_PERCENT}, fixed: 1–${LIMITS.COUPON_MAX_FIXED}`,
      },
      maxDiscount: { type: 'integer', example: 2000, description: 'Optional; empty = no cap' },
      minOrderAmount: { type: 'integer', example: 3000, default: 0 },
      startsAt: { type: 'string', format: 'date-time', description: 'Optional; default now' },
      expiresAt: { type: 'string', format: 'date-time', example: '2026-12-31T23:59:59Z' },
      usageLimit: { type: 'integer', example: 100, description: 'Optional; empty = unlimited' },
      isActive: { type: 'boolean', default: true },
    },
  }),
};

// The `:id` part of the URL
const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Coupon id (24-character ObjectId)',
  schema: { type: 'string', example: '665f1c2e9b1e8a00123456aa' },
};

// Every admin route has the same guard errors
const adminGuard = {
  401: err('Unauthorized'),
  403: errorBody('Not an admin'),
};

export default {
  // Registered in openapi.js under components.schemas
  schemas: { Coupon },
  tags: [
    {
      name: 'Coupons',
      description:
        'Discount codes. Customers preview a code on their cart; admins create and manage codes.',
    },
  ],
  paths: {
    '/coupons/validate': {
      post: {
        tags: ['Coupons'],
        summary: 'Preview a coupon on my cart (customer; does not use it up)',
        security: secured,
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['code'],
            properties: { code: { type: 'string', example: 'eid25' } },
          }),
        },
        responses: {
          200: {
            description: 'Coupon applied: the discount and the new totals of my cart',
            ...envelope({
              type: 'object',
              properties: {
                code: { type: 'string', example: 'EID25' },
                type: { type: 'string', enum: Object.values(COUPON_TYPES) },
                value: { type: 'integer', example: 25 },
                description: { type: 'string' },
                itemsPrice: { type: 'integer', example: 4000 },
                discountPrice: { type: 'integer', example: 1000 },
                shippingPrice: { type: 'integer', example: 250 },
                taxPrice: { type: 'integer', example: 0 },
                totalPrice: { type: 'integer', example: 3250 },
              },
            }),
          },
          400: errorBody(
            'No code sent, empty cart, or the coupon cannot be used (not active, not active yet, expired, usage limit reached, minimum order not met)',
          ),
          401: err('Unauthorized'),
          403: errorBody('Not a customer'),
          404: errorBody('Coupon not found'),
        },
      },
    },
    '/coupons': {
      get: {
        tags: ['Coupons'],
        summary: 'All coupons, newest first (admin)',
        security: secured,
        responses: {
          200: { description: 'Coupons fetched', ...envelope({ type: 'array', items: ref }) },
          ...adminGuard,
        },
      },
      post: {
        tags: ['Coupons'],
        summary: 'Create a coupon (admin)',
        security: secured,
        requestBody: couponInput,
        responses: {
          201: { description: 'Coupon created', ...envelope(ref) },
          400: err('BadRequest'),
          ...adminGuard,
          409: errorBody('Coupon code already exists'),
        },
      },
    },
    '/coupons/{id}': {
      get: {
        tags: ['Coupons'],
        summary: 'One coupon (admin)',
        security: secured,
        parameters: [idParam],
        responses: {
          200: { description: 'Coupon fetched', ...envelope(ref) },
          400: err('BadRequest'),
          ...adminGuard,
          404: errorBody('Coupon not found'),
        },
      },
      put: {
        tags: ['Coupons'],
        summary: 'Replace a coupon’s settings (admin; usedCount is never changed here)',
        security: secured,
        parameters: [idParam],
        requestBody: couponInput,
        responses: {
          200: { description: 'Coupon updated', ...envelope(ref) },
          400: err('BadRequest'),
          ...adminGuard,
          404: errorBody('Coupon not found'),
          409: errorBody('Coupon code already exists'),
        },
      },
      delete: {
        tags: ['Coupons'],
        summary: 'Delete a coupon, or only deactivate it when it was already used (admin)',
        security: secured,
        parameters: [idParam],
        responses: {
          200: {
            description: 'Coupon deleted (deactivated: false) or deactivated (deactivated: true)',
            ...envelope({ type: 'object', properties: { deactivated: { type: 'boolean' } } }),
          },
          400: err('BadRequest'),
          ...adminGuard,
          404: errorBody('Coupon not found'),
        },
      },
    },
  },
};
