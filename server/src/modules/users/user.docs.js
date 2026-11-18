/**
 * src/modules/users/user.docs.js – OpenAPI description of the /users routes
 * (the logged-in user's own profile and password).
 * Merged into the full spec by src/docs/openapi.js. Keep it in sync with user.routes.js.
 */

// Small helpers so each route below stays short and readable (same as auth.docs.js)
const json = (schema) => ({ content: { 'application/json': { schema } } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const err = (name) => ({ $ref: `#/components/responses/${name}` });
const body = (properties, required) => ({
  required: true,
  ...json({ type: 'object', required, properties }),
});
const secured = [{ bearerAuth: [] }]; // marks a route as "needs a token"

// Success envelope whose `data` is one user
const userResult = json({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string' },
    data: ref('User'),
  },
});

export default {
  tags: [{ name: 'Users', description: "The logged-in user's own account" }],
  paths: {
    '/users/profile': {
      get: {
        tags: ['Users'],
        summary: 'My profile',
        security: secured,
        responses: {
          200: { description: 'Profile fetched', ...userResult },
          401: err('Unauthorized'),
        },
      },
      put: {
        tags: ['Users'],
        summary: 'Update my profile (only name and phone; other fields are ignored)',
        security: secured,
        requestBody: body(
          {
            name: { type: 'string', example: 'Ali Khan', description: '2–50 chars' },
            phone: {
              type: 'string',
              nullable: true,
              example: '03001234567',
              description: '03XXXXXXXXX. Send "" or null to remove it.',
            },
          },
          [],
        ),
        responses: {
          200: { description: 'Profile updated', ...userResult },
          400: err('BadRequest'),
          401: err('Unauthorized'),
        },
      },
    },
    '/users/password': {
      put: {
        tags: ['Users'],
        summary: 'Change password (returns a fresh token)',
        security: secured,
        requestBody: body(
          {
            currentPassword: { type: 'string' },
            newPassword: {
              type: 'string',
              example: 'secret123',
              description: '8–64 chars, a letter and a number',
            },
          },
          ['currentPassword', 'newPassword'],
        ),
        responses: {
          200: { description: 'Updated – use the new token from data.token' },
          400: err('BadRequest'),
          401: err('Unauthorized'),
        },
      },
    },
  },
};
