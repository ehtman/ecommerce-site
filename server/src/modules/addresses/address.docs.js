/**
 * src/modules/addresses/address.docs.js – OpenAPI description of the /addresses routes.
 * Merged into the full spec by src/docs/openapi.js. Keep it in sync with address.routes.js.
 */
import { PROVINCES, ADDRESS_LABELS, LIMITS } from '../../config/constants.js';

// Small helpers so each route below stays short and readable (same as auth.docs.js)
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
const oneAddress = envelope(ref('Address'));
const addressList = envelope({ type: 'array', items: ref('Address') });

// The `:id` part of the URL
const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Address id (24-character ObjectId)',
  schema: { type: 'string', example: '665f1c2e9b1e8a0012345678' },
};

// What the client sends when creating or replacing an address
const addressInput = {
  required: true,
  ...json({
    type: 'object',
    required: ['fullName', 'phone', 'addressLine1', 'city', 'province', 'postalCode'],
    properties: {
      label: { type: 'string', enum: [...ADDRESS_LABELS], default: 'Home' },
      fullName: { type: 'string', example: 'Ali Khan', description: '2–60 chars' },
      phone: { type: 'string', example: '03001234567', description: '03XXXXXXXXX' },
      addressLine1: { type: 'string', example: 'House 12, Street 4, Gulberg III' },
      addressLine2: { type: 'string', example: 'Near Liberty Market' },
      city: { type: 'string', example: 'Lahore' },
      province: { type: 'string', enum: [...PROVINCES], example: 'Punjab' },
      postalCode: { type: 'string', example: '54000', description: '5 digits' },
      isDefault: { type: 'boolean', description: 'true = make this my default address' },
    },
  }),
};

// Every address route has the same guard errors
const guarded = {
  401: err('Unauthorized'),
  403: { description: 'Not a customer (admins cannot use addresses)', ...json(ref('Error')) },
};

export default {
  tags: [
    {
      name: 'Addresses',
      description: `The logged-in customer's delivery addresses (max ${LIMITS.MAX_ADDRESSES}, exactly one default)`,
    },
  ],
  paths: {
    '/addresses': {
      get: {
        tags: ['Addresses'],
        summary: 'My addresses (default first, then newest)',
        security: secured,
        responses: { 200: { description: 'Addresses fetched', ...addressList }, ...guarded },
      },
      post: {
        tags: ['Addresses'],
        summary: 'Add an address (the first one becomes the default)',
        security: secured,
        requestBody: addressInput,
        responses: {
          201: { description: 'Address added', ...oneAddress },
          400: {
            description: `Validation failed, or already ${LIMITS.MAX_ADDRESSES} addresses`,
            ...json(ref('Error')),
          },
          ...guarded,
        },
      },
    },
    '/addresses/{id}': {
      put: {
        tags: ['Addresses'],
        summary: 'Replace one of my addresses',
        security: secured,
        parameters: [idParam],
        requestBody: addressInput,
        responses: {
          200: { description: 'Address updated', ...oneAddress },
          400: err('BadRequest'),
          ...guarded,
          404: err('NotFound'),
        },
      },
      delete: {
        tags: ['Addresses'],
        summary: 'Delete one of my addresses (if it was the default, the newest one takes over)',
        security: secured,
        parameters: [idParam],
        responses: {
          200: { description: 'Address deleted', ...json(ref('Message')) },
          400: err('BadRequest'),
          ...guarded,
          404: err('NotFound'),
        },
      },
    },
    '/addresses/{id}/default': {
      patch: {
        tags: ['Addresses'],
        summary: 'Make this my default address (returns the updated list)',
        security: secured,
        parameters: [idParam],
        responses: {
          200: { description: 'Default address updated', ...addressList },
          400: err('BadRequest'),
          ...guarded,
          404: err('NotFound'),
        },
      },
    },
  },
};
