/**
 * src/modules/reviews/review.docs.js – OpenAPI description of the review routes.
 * Merged into the full spec by src/docs/openapi.js. Keep it in sync with review.routes.js
 * AND with the nested review routes in products/product.routes.js.
 */
import { REVIEW } from '../../config/constants.js';

// Small helpers so each route below stays short and readable (same as address.docs.js)
const json = (schema) => ({ content: { 'application/json': { schema } } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const err = (name) => ({ $ref: `#/components/responses/${name}` });
const secured = [{ bearerAuth: [] }]; // marks a route as "needs a token"
const error = (description) => ({ description, ...json(ref('Error')) });

// Success envelope around any `data` schema (+ optional pagination `meta`)
const envelope = (data, withMeta = false) =>
  json({
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string' },
      data,
      ...(withMeta && {
        meta: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: REVIEW.PAGE_SIZE },
            total: { type: 'integer', example: 12 },
            pages: { type: 'integer', example: 3 },
          },
        },
      }),
    },
  });

// What a review looks like in a response (kept here, next to the module that owns it)
const review = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '665f1c2e9b1e8a00123456aa' },
    user: {
      description: 'Author id, or { _id, name } in lists (admins also see the email)',
      oneOf: [{ type: 'string' }, { type: 'object' }],
    },
    product: { description: 'Product id, or { _id, name, slug } in the admin list' },
    order: { type: 'string', description: 'The delivered order that proves the purchase' },
    rating: { type: 'integer', minimum: REVIEW.RATING_MIN, maximum: REVIEW.RATING_MAX },
    title: { type: 'string', example: 'Great value' },
    comment: { type: 'string', example: 'Strong handle and keeps tea hot for ages.' },
    isVisible: { type: 'boolean', description: 'false = hidden by an admin (moderation)' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};
const oneReview = envelope(review);
const reviewPage = envelope({ type: 'array', items: review }, true);

// The two kinds of `:id` in review URLs
const productIdParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Product id (24-character ObjectId)',
  schema: { type: 'string', example: '665f1c2e9b1e8a0012345678' },
};
const reviewIdParam = { ...productIdParam, description: 'Review id (24-character ObjectId)' };
// ?page & ?limit
const pageParams = (defaultLimit, maxLimit) => [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: maxLimit, default: defaultLimit },
  },
];

// What the author sends when writing or editing a review
const reviewInput = {
  required: true,
  ...json({
    type: 'object',
    required: ['rating', 'comment'],
    properties: {
      rating: {
        type: 'integer',
        minimum: REVIEW.RATING_MIN,
        maximum: REVIEW.RATING_MAX,
        example: 5,
      },
      title: {
        type: 'string',
        maxLength: REVIEW.TITLE_MAX,
        example: 'Great value',
        description: 'Optional; empty removes it',
      },
      comment: {
        type: 'string',
        minLength: REVIEW.COMMENT_MIN,
        maxLength: REVIEW.COMMENT_MAX,
        example: 'Strong handle and keeps tea hot for ages.',
      },
    },
  }),
};

export default {
  tags: [
    {
      name: 'Reviews',
      description:
        'Product reviews: only after the order is DELIVERED, one per product per customer. ' +
        'Every change recalculates the product ratingAverage / ratingCount.',
    },
  ],
  paths: {
    '/products/{id}/reviews': {
      get: {
        tags: ['Reviews'],
        summary: 'Visible reviews of a product, newest first (public)',
        parameters: [productIdParam, ...pageParams(REVIEW.PAGE_SIZE, REVIEW.MAX_PAGE_SIZE)],
        responses: {
          200: { description: 'Reviews fetched', ...reviewPage },
          400: err('BadRequest'),
          404: error('Product not found'),
        },
      },
      post: {
        tags: ['Reviews'],
        summary: 'Review a product you received (customers only)',
        security: secured,
        parameters: [productIdParam],
        requestBody: reviewInput,
        responses: {
          201: { description: 'Thank you for your review', ...oneReview },
          400: err('BadRequest'),
          401: err('Unauthorized'),
          403: error('Not a customer, or no DELIVERED order contains this product'),
          404: error('Product not found'),
          409: error('You already reviewed this product'),
        },
      },
    },
    '/products/{id}/reviews/eligibility': {
      get: {
        tags: ['Reviews'],
        summary: 'May I review this product? ({ canReview, reason?, review? })',
        security: secured,
        parameters: [productIdParam],
        responses: {
          200: {
            description: 'Eligibility checked',
            ...envelope({
              type: 'object',
              properties: {
                canReview: { type: 'boolean' },
                reason: { type: 'string', example: 'You already reviewed this product' },
                review: { ...review, description: 'Your existing review, if any' },
              },
            }),
          },
          400: err('BadRequest'),
          401: err('Unauthorized'),
          404: error('Product not found'),
        },
      },
    },
    '/reviews/admin': {
      get: {
        tags: ['Reviews'],
        summary: 'Moderation list: every review, visible and hidden (admin)',
        security: secured,
        parameters: [
          {
            name: 'rating',
            in: 'query',
            schema: { type: 'integer', minimum: REVIEW.RATING_MIN, maximum: REVIEW.RATING_MAX },
          },
          {
            name: 'visibility',
            in: 'query',
            schema: { type: 'string', enum: ['visible', 'hidden'] },
          },
          { name: 'product', in: 'query', schema: { type: 'string' }, description: 'Product id' },
          ...pageParams(REVIEW.ADMIN_PAGE_SIZE, REVIEW.ADMIN_MAX_PAGE_SIZE),
        ],
        responses: {
          200: { description: 'Reviews fetched', ...reviewPage },
          400: err('BadRequest'),
          401: err('Unauthorized'),
          403: error('Admins only'),
        },
      },
    },
    '/reviews/{id}': {
      put: {
        tags: ['Reviews'],
        summary: 'Edit my review (author only)',
        security: secured,
        parameters: [reviewIdParam],
        requestBody: reviewInput,
        responses: {
          200: { description: 'Review updated', ...oneReview },
          400: err('BadRequest'),
          401: err('Unauthorized'),
          403: error('Not a customer'),
          404: error("Review not found (or it is someone else's)"),
        },
      },
      delete: {
        tags: ['Reviews'],
        summary: 'Delete a review (the author, or an admin)',
        security: secured,
        parameters: [reviewIdParam],
        responses: {
          200: { description: 'Review deleted', ...json(ref('Message')) },
          400: err('BadRequest'),
          401: err('Unauthorized'),
          404: error("Review not found (or it is someone else's)"),
        },
      },
    },
    '/reviews/{id}/visibility': {
      patch: {
        tags: ['Reviews'],
        summary: 'Hide or show a review (admin moderation)',
        security: secured,
        parameters: [reviewIdParam],
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['isVisible'],
            properties: { isVisible: { type: 'boolean', example: false } },
          }),
        },
        responses: {
          200: { description: 'Review hidden / Review is visible', ...oneReview },
          400: err('BadRequest'),
          401: err('Unauthorized'),
          403: error('Admins only'),
          404: error('Review not found'),
        },
      },
    },
  },
};
