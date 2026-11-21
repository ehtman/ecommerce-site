/**
 * src/modules/wishlist/wishlist.docs.js – OpenAPI description of the /wishlist routes.
 * Merged into the full spec by src/docs/openapi.js. Keep it in sync with wishlist.routes.js.
 */
import { LIMITS } from '../../config/constants.js';

// Small helpers so each route below stays short and readable (same as address.docs.js)
const json = (schema) => ({ content: { 'application/json': { schema } } });
const err = (name) => ({ $ref: `#/components/responses/${name}` });
const errorBody = json({ $ref: '#/components/schemas/Error' });
const secured = [{ bearerAuth: [] }]; // marks a route as "needs a token"

// The wishlist as the server returns it
const wishlistResponse = (description) => ({
  description,
  ...json({
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string' },
      data: {
        type: 'object',
        properties: {
          productIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Ids of the saved, active products (to colour heart icons)',
          },
          items: {
            type: 'array',
            description: 'Product cards (inactive products are hidden)',
            items: {
              type: 'object',
              properties: {
                _id: { type: 'string' },
                name: { type: 'string', example: 'Ceramic Coffee Mug' },
                slug: { type: 'string', example: 'ceramic-coffee-mug' },
                price: { type: 'integer', example: 1200 },
                stock: { type: 'integer', example: 20 },
              },
            },
          },
        },
      },
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

// Every wishlist route has the same guard errors
const guarded = {
  401: err('Unauthorized'),
  403: { description: 'Not a customer (admins have no wishlist)', ...errorBody },
};

export default {
  tags: [
    {
      name: 'Wishlist',
      description: `The logged-in customer's saved products (max ${LIMITS.MAX_WISHLIST}, no duplicates)`,
    },
  ],
  paths: {
    '/wishlist': {
      get: {
        tags: ['Wishlist'],
        summary: 'My wishlist',
        security: secured,
        responses: { 200: wishlistResponse('Wishlist fetched'), ...guarded },
      },
    },
    '/wishlist/{productId}': {
      post: {
        tags: ['Wishlist'],
        summary: 'Save a product (idempotent: saving twice changes nothing)',
        security: secured,
        parameters: [productIdParam],
        responses: {
          200: wishlistResponse('Added to wishlist'),
          400: {
            description: `Invalid id, or the wishlist already holds ${LIMITS.MAX_WISHLIST} products`,
            ...errorBody,
          },
          ...guarded,
          404: { description: 'Product not found or not active', ...errorBody },
        },
      },
      delete: {
        tags: ['Wishlist'],
        summary: 'Remove a product (not in the list → still 200)',
        security: secured,
        parameters: [productIdParam],
        responses: {
          200: wishlistResponse('Removed from wishlist'),
          400: err('BadRequest'),
          ...guarded,
        },
      },
    },
  },
};
