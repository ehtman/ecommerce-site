/**
 * src/modules/cart/cart.docs.js – OpenAPI description of the /cart routes.
 * Merged into the full spec by src/docs/openapi.js. Keep it in sync with cart.routes.js.
 * The Cart schema lives here (not in openapi.js) so the module stays self-contained.
 */
import { LIMITS, PRICING } from '../../config/constants.js';

// Small helpers so each route below stays short and readable (same as address.docs.js)
const json = (schema) => ({ content: { 'application/json': { schema } } });
const err = (name) => ({ $ref: `#/components/responses/${name}` });
const errorBody = json({ $ref: '#/components/schemas/Error' });
const secured = [{ bearerAuth: [] }]; // marks a route as "needs a token"

// The cart as the server returns it: every number is calculated on the server
const cartSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          product: {
            type: 'object',
            properties: {
              _id: { type: 'string', example: '665f1c2e9b1e8a0012345678' },
              name: { type: 'string', example: 'Ceramic Coffee Mug' },
              slug: { type: 'string', example: 'ceramic-coffee-mug' },
              price: { type: 'integer', example: 1200, description: 'Current price (Rs)' },
              compareAtPrice: { type: 'integer', example: 1500 },
              image: { type: 'string', description: 'First product image URL' },
              stock: { type: 'integer', example: 20 },
              isActive: { type: 'boolean' },
            },
          },
          quantity: { type: 'integer', example: 2 },
          lineTotal: { type: 'integer', example: 2400, description: 'price × quantity' },
          issue: {
            type: 'string',
            nullable: true,
            example: null,
            description: 'Why this line cannot be bought now (inactive, out of stock…)',
          },
        },
      },
    },
    itemCount: { type: 'integer', example: 2, description: 'Pieces without issues' },
    subtotal: { type: 'integer', example: 2400 },
    shipping: {
      type: 'integer',
      example: PRICING.SHIPPING_FEE,
      description: `Rs ${PRICING.SHIPPING_FEE}, free from Rs ${PRICING.FREE_SHIPPING_MIN}`,
    },
    total: { type: 'integer', example: 2650 },
    hasIssues: { type: 'boolean', description: 'true → fix the cart before checkout' },
    freeShippingMin: { type: 'integer', example: PRICING.FREE_SHIPPING_MIN },
  },
};
const cartResponse = (description) => ({
  description,
  ...json({
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string' },
      data: cartSchema,
    },
  }),
});

// The `:productId` part of the URL
const productIdParam = {
  name: 'productId',
  in: 'path',
  required: true,
  description: 'Product id (24-character ObjectId)',
  schema: { type: 'string', example: '665f1c2e9b1e8a0012345678' },
};

const quantity = {
  type: 'integer',
  minimum: 1,
  maximum: LIMITS.MAX_CART_QTY,
  example: 2,
  description: `1–${LIMITS.MAX_CART_QTY}, and never more than the stock`,
};

// Every cart route has the same guard errors
const guarded = {
  401: err('Unauthorized'),
  403: { description: 'Not a customer (admins have no cart)', ...errorBody },
};

export default {
  tags: [
    {
      name: 'Cart',
      description: `The logged-in customer's cart. Prices and totals are always calculated on the server (max ${LIMITS.MAX_CART_QTY} per product).`,
    },
  ],
  paths: {
    '/cart': {
      get: {
        tags: ['Cart'],
        summary: 'My cart with live prices, shipping and total',
        security: secured,
        responses: { 200: cartResponse('Cart fetched'), ...guarded },
      },
      delete: {
        tags: ['Cart'],
        summary: 'Empty my cart',
        security: secured,
        responses: { 200: cartResponse('Cart cleared'), ...guarded },
      },
    },
    '/cart/items': {
      post: {
        tags: ['Cart'],
        summary: 'Add a product (already in the cart → quantities are added)',
        description:
          'Only `productId` and `quantity` are read. A `price` sent by the client is ignored.',
        security: secured,
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['productId', 'quantity'],
            properties: {
              productId: { type: 'string', example: '665f1c2e9b1e8a0012345678' },
              quantity,
            },
          }),
        },
        responses: {
          200: cartResponse('Added to cart'),
          400: {
            description: `Validation failed, more than ${LIMITS.MAX_CART_QTY} in total, or not enough stock`,
            ...errorBody,
          },
          ...guarded,
          404: { description: 'Product not found or not active', ...errorBody },
        },
      },
    },
    '/cart/items/{productId}': {
      put: {
        tags: ['Cart'],
        summary: 'Set the quantity of a product in my cart',
        security: secured,
        parameters: [productIdParam],
        requestBody: {
          required: true,
          ...json({ type: 'object', required: ['quantity'], properties: { quantity } }),
        },
        responses: {
          200: cartResponse('Cart updated'),
          400: { description: 'Invalid id/quantity or not enough stock', ...errorBody },
          ...guarded,
          404: { description: 'Product not found/active, or not in my cart', ...errorBody },
        },
      },
      delete: {
        tags: ['Cart'],
        summary: 'Remove a product from my cart (not in the cart → still 200)',
        security: secured,
        parameters: [productIdParam],
        responses: {
          200: cartResponse('Item removed'),
          400: err('BadRequest'),
          ...guarded,
        },
      },
    },
  },
};
