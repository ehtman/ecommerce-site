/**
 * src/docs/openapi.js – the OpenAPI (Swagger) description of the whole API.
 *
 * OpenAPI is the industry-standard "contract" format for REST APIs: which URLs exist,
 * what they accept, what they return. Swagger UI turns it into an interactive page at
 * /api/docs, and Postman/Bruno can import /api/docs.json.
 *
 * Each module keeps its own part next to its code (e.g. modules/auth/auth.docs.js);
 * this file only merges them. A new module = one new import + one spread below.
 */
import { ADDRESS_LABELS, PROVINCES } from '../config/constants.js';
import authDocs from '../modules/auth/auth.docs.js';
import userDocs from '../modules/users/user.docs.js';
import addressDocs from '../modules/addresses/address.docs.js';

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'ShopEase API',
    version: '1.0.0',
    description:
      'Learning build of the ShopEase store API. Log in, copy the `token`, press **Authorize** and paste it to call protected routes.',
  },
  servers: [{ url: '/api', description: 'This server' }],
  components: {
    // "bearerAuth" = send `Authorization: Bearer <token>`
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    // Reusable shapes referenced with $ref below and in module docs
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Validation failed' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: { field: { type: 'string' }, message: { type: 'string' } },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '665f1c2e9b1e8a0012345678' },
          name: { type: 'string', example: 'Ali Khan' },
          email: { type: 'string', example: 'ali@example.com' },
          phone: { type: 'string', example: '03001234567', description: 'Optional' },
          role: { type: 'string', enum: ['customer', 'admin'] },
          authProvider: { type: 'string', enum: ['local', 'google'] },
          isEmailVerified: { type: 'boolean' },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Address: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '665f1c2e9b1e8a0012345679' },
          user: { type: 'string', description: 'Owner id (always the logged-in customer)' },
          label: { type: 'string', enum: [...ADDRESS_LABELS] },
          fullName: { type: 'string', example: 'Ali Khan' },
          phone: { type: 'string', example: '03001234567' },
          addressLine1: { type: 'string', example: 'House 12, Street 4, Gulberg III' },
          addressLine2: { type: 'string', example: 'Near Liberty Market' },
          city: { type: 'string', example: 'Lahore' },
          province: { type: 'string', enum: [...PROVINCES], example: 'Punjab' },
          postalCode: { type: 'string', example: '54000' },
          country: { type: 'string', example: 'Pakistan' },
          isDefault: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      AuthResult: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              token: { type: 'string', description: 'JWT – send as Bearer token' },
              user: { $ref: '#/components/schemas/User' },
            },
          },
        },
      },
      Message: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: { nullable: true },
        },
      },
    },
    // Reusable error responses
    responses: {
      BadRequest: {
        description: 'Validation failed',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Unauthorized: {
        description: 'Missing, invalid or expired token / wrong credentials',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Forbidden: {
        description: 'Logged in but not allowed',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: "Not found (or not yours: other customers' data is invisible)",
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      TooMany: {
        description: 'Rate limit reached',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
  tags: [
    { name: 'Health', description: 'Is the server up?' },
    ...authDocs.tags,
    ...userDocs.tags,
    ...addressDocs.tags,
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: { 200: { description: 'Server and database status' } },
      },
    },
    ...authDocs.paths,
    ...userDocs.paths,
    ...addressDocs.paths,
  },
};

export default spec;
