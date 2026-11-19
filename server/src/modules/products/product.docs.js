/**
 * src/modules/products/product.docs.js – OpenAPI description of the /products routes.
 * Merged into the full spec by src/docs/openapi.js. Keep it in sync with product.routes.js.
 */
import { LIMITS } from '../../config/constants.js';
import { SORTS } from './product.query.js';

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
const oneProduct = envelope(ref('Product'));

// A query-string parameter
const q = (name, description, schema = { type: 'string' }) => ({
  name,
  in: 'query',
  required: false,
  description,
  schema,
});
const idParam = (name = 'id', what = 'Product') => ({
  name,
  in: 'path',
  required: true,
  description: `${what} id (24-character ObjectId)`,
  schema: { type: 'string', example: '665f1c2e9b1e8a0012345678' },
});

// What the admin form sends on create and update (the WHOLE product both times)
const productInput = {
  required: true,
  ...json({
    type: 'object',
    required: ['name', 'description', 'sku', 'price', 'category', 'images'],
    properties: {
      name: { type: 'string', example: 'Blue Cotton Shirt', description: '3–120 chars' },
      description: { type: 'string', example: 'A soft, breathable cotton shirt for summer.' },
      brand: { type: 'string', example: 'Khaadi', description: 'optional, max 50' },
      sku: { type: 'string', example: 'SHIRT-BLU-M', description: 'A–Z, 0–9, dashes, 3–30' },
      price: { type: 'integer', example: 1999, description: 'whole rupees, 1 – 10,000,000' },
      compareAtPrice: {
        type: 'integer',
        nullable: true,
        example: 2500,
        description: 'optional "was" price; must be greater than price ("" or null removes it)',
      },
      category: { type: 'string', example: '665f1c2e9b1e8a0012345670' },
      stock: { type: 'integer', example: 20, description: 'CREATE only (default 0)' },
      images: {
        type: 'array',
        minItems: 1,
        maxItems: LIMITS.MAX_PRODUCT_IMAGES,
        description: 'Each from POST /uploads/image',
        items: ref('Image'),
      },
      specifications: {
        type: 'array',
        maxItems: LIMITS.MAX_SPECIFICATIONS,
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', example: 'Material' },
            value: { type: 'string', example: 'Cotton' },
          },
        },
      },
      isFeatured: { type: 'boolean' },
      isActive: { type: 'boolean', description: 'false = hidden from the shop' },
    },
  }),
};

const adminGuard = { 401: err('Unauthorized'), 403: err('Forbidden') };

export default {
  tags: [
    {
      name: 'Products',
      description: 'The catalogue. Public reads show ACTIVE products only; writes are admin-only.',
    },
  ],
  paths: {
    '/products': {
      get: {
        tags: ['Products'],
        summary: 'List active products (filters, search, sort, pagination)',
        parameters: [
          q('keyword', 'Text search in name (strongest), brand and description'),
          q('category', 'Category SLUG; a top-level category includes its sub-categories'),
          q('minPrice', 'Lowest price (inclusive)', { type: 'integer' }),
          q('maxPrice', 'Highest price (inclusive)', { type: 'integer' }),
          q('rating', 'Minimum average rating (1–5)', { type: 'number' }),
          q('inStock', '"true" = only products with stock > 0', { type: 'string', enum: ['true'] }),
          q('isFeatured', '"true" = only featured products', { type: 'string', enum: ['true'] }),
          q('brand', 'Exact brand, case-insensitive'),
          q('sort', 'Order (default newest)', { type: 'string', enum: Object.keys(SORTS) }),
          q('page', 'Page number (default 1)', { type: 'integer', minimum: 1 }),
          q('limit', 'Per page (default 12, max 48)', { type: 'integer', minimum: 1 }),
        ],
        responses: {
          200: {
            description: 'Products fetched (product cards, no description)',
            ...envelope({ type: 'array', items: ref('Product') }, true),
          },
        },
      },
      post: {
        tags: ['Products'],
        summary: 'Create a product (admin). The slug is generated from the name.',
        security: secured,
        requestBody: productInput,
        responses: {
          201: { description: 'Product created', ...oneProduct },
          400: err('BadRequest'),
          ...adminGuard,
          409: { description: 'SKU already used', ...json(ref('Error')) },
        },
      },
    },
    '/products/brands': {
      get: {
        tags: ['Products'],
        summary: 'Every brand used by an active product, A→Z',
        responses: {
          200: {
            description: 'Brands fetched',
            ...envelope({ type: 'array', items: { type: 'string' }, example: ['Khaadi'] }),
          },
        },
      },
    },
    // ONE path key for slug (GET) and id (PUT/DELETE): OpenAPI forbids two templated paths
    // at the same level ('/products/{slug}' and '/products/{id}'), as in category.docs.js.
    '/products/{slugOrId}': {
      get: {
        tags: ['Products'],
        summary: 'One active product by slug (inactive = 404)',
        parameters: [
          {
            name: 'slugOrId',
            description: 'The product SLUG for this public read',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'blue-cotton-shirt' },
          },
        ],
        responses: { 200: { description: 'Product fetched', ...oneProduct }, 404: err('NotFound') },
      },
      put: {
        tags: ['Products'],
        summary:
          'Replace a product (admin). Stock is NOT changed here; removed images are deleted.',
        security: secured,
        parameters: [idParam('slugOrId')],
        requestBody: productInput,
        responses: {
          200: { description: 'Product updated', ...oneProduct },
          400: err('BadRequest'),
          ...adminGuard,
          404: err('NotFound'),
          409: { description: 'SKU already used by another product', ...json(ref('Error')) },
        },
      },
      delete: {
        tags: ['Products'],
        summary: 'Delete a product and its images (admin)',
        security: secured,
        parameters: [idParam('slugOrId')],
        responses: {
          200: {
            description: 'Product deleted',
            ...envelope({
              type: 'object',
              properties: { softDeleted: { type: 'boolean', example: false } },
            }),
          },
          400: err('BadRequest'),
          ...adminGuard,
          404: err('NotFound'),
        },
      },
    },
    '/products/{id}/images/{imageId}': {
      delete: {
        tags: ['Products'],
        summary: 'Remove one image (admin). A product keeps at least one.',
        security: secured,
        parameters: [idParam(), idParam('imageId', 'Image')],
        responses: {
          200: { description: 'Image removed', ...oneProduct },
          400: { description: 'Invalid id, or it is the last image', ...json(ref('Error')) },
          ...adminGuard,
          404: err('NotFound'),
        },
      },
    },
    '/products/{id}/stock': {
      patch: {
        tags: ['Products'],
        summary: 'Change the stock (admin), recorded in the stock history',
        security: secured,
        parameters: [idParam()],
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['mode', 'value', 'reason'],
            properties: {
              mode: {
                type: 'string',
                enum: ['adjust', 'set'],
                description: 'adjust = add/subtract value; set = value is the new total',
              },
              value: { type: 'integer', example: 20 },
              reason: { type: 'string', example: 'New delivery', description: '3–100 chars' },
            },
          }),
        },
        responses: {
          200: {
            description: 'Stock updated',
            ...envelope({
              type: 'object',
              properties: { _id: { type: 'string' }, stock: { type: 'integer', example: 40 } },
            }),
          },
          400: {
            description: 'Validation failed, would go below zero, or no change',
            ...json(ref('Error')),
          },
          ...adminGuard,
          404: err('NotFound'),
        },
      },
    },
  },
};
