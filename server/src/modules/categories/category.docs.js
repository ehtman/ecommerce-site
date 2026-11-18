/**
 * src/modules/categories/category.docs.js – OpenAPI description of the /categories routes.
 * Merged into the full spec by src/docs/openapi.js. Keep it in sync with category.routes.js.
 */

// Small helpers so each route below stays short and readable (same as address.docs.js)
const json = (schema) => ({ content: { 'application/json': { schema } } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const err = (name) => ({ $ref: `#/components/responses/${name}` });
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
const oneCategory = envelope(ref('Category'));
const categoryList = envelope({ type: 'array', items: ref('Category') });

// GET uses the readable slug, PUT/DELETE use the stable id. In Express both are just
// "/:something", and OpenAPI also treats /categories/{slug} and /categories/{id} as the
// SAME path, so the spec documents one path whose parameter means slug OR id per method.
const idParam = {
  name: 'slugOrId',
  in: 'path',
  required: true,
  description: 'PUT/DELETE: the category id (24-character ObjectId)',
  schema: { type: 'string', example: '665f1c2e9b1e8a0012345680' },
};

const slugParam = {
  name: 'slugOrId',
  in: 'path',
  required: true,
  description: 'GET: the slug (URL-friendly name generated from the category name)',
  schema: { type: 'string', example: 'mens-shoes' },
};

// The fields an admin may send. `required` differs between create and update.
const inputProperties = {
  name: { type: 'string', example: "Men's Shoes", description: '2–50 chars, unique (any case)' },
  description: { type: 'string', example: 'Sneakers, formal shoes and sandals', maxLength: 300 },
  parent: {
    type: 'string',
    nullable: true,
    description: 'Id of a TOP-LEVEL category. null or "" = top-level (only two levels allowed)',
  },
  image: {
    allOf: [ref('Image')],
    nullable: true,
    description: 'An image already on Cloudinary. null removes it. (Uploads arrive in branch 04)',
  },
  isActive: { type: 'boolean', default: true, description: 'false = hidden from customers' },
  sortOrder: { type: 'integer', minimum: 0, maximum: 1000, default: 0 },
};

// Every admin route has the same guard errors
const adminGuard = {
  401: err('Unauthorized'),
  403: { description: 'Not an admin', ...json(ref('Error')) },
};

export default {
  tags: [
    {
      name: 'Categories',
      description:
        'Public: browse active categories (by slug). Admin: create, update, delete. Two levels at most.',
    },
  ],
  paths: {
    '/categories': {
      get: {
        tags: ['Categories'],
        summary: 'Active categories in menu order (public, flat list – `parent` links the levels)',
        responses: { 200: { description: 'Categories fetched', ...categoryList } },
      },
      post: {
        tags: ['Categories'],
        summary: 'Create a category (admin). The slug is generated from the name',
        security: secured,
        requestBody: {
          required: true,
          ...json({ type: 'object', required: ['name'], properties: inputProperties }),
        },
        responses: {
          201: { description: 'Category created', ...oneCategory },
          400: {
            description: 'Validation failed, parent not found, or a third level',
            ...json(ref('Error')),
          },
          ...adminGuard,
          409: { description: 'A category with this name already exists', ...json(ref('Error')) },
        },
      },
    },
    '/categories/{slugOrId}': {
      get: {
        tags: ['Categories'],
        summary: 'One active category by slug (public)',
        parameters: [slugParam],
        responses: {
          200: { description: 'Category fetched', ...oneCategory },
          404: { description: 'Not found or inactive', ...json(ref('Error')) },
        },
      },
      put: {
        tags: ['Categories'],
        summary: 'Update any subset of fields (admin). Renaming also changes the slug',
        security: secured,
        parameters: [idParam],
        requestBody: { required: true, ...json({ type: 'object', properties: inputProperties }) },
        responses: {
          200: { description: 'Category updated', ...oneCategory },
          400: {
            description: 'Validation failed, invalid id, or a hierarchy rule broken',
            ...json(ref('Error')),
          },
          ...adminGuard,
          404: err('NotFound'),
          409: { description: 'Another category has this name', ...json(ref('Error')) },
        },
      },
      delete: {
        tags: ['Categories'],
        summary: 'Delete a category (admin). Refused while it has sub-categories',
        security: secured,
        parameters: [idParam],
        responses: {
          200: { description: 'Category deleted', ...json(ref('Message')) },
          400: { description: 'Invalid id, or it has sub-categories', ...json(ref('Error')) },
          ...adminGuard,
          404: err('NotFound'),
        },
      },
    },
  },
};
