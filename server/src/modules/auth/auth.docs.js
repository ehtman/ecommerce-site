/**
 * src/modules/auth/auth.docs.js – OpenAPI description of the auth routes.
 * (The /users/* routes moved to modules/users/user.docs.js in branch 02.)
 * Merged into the full spec by src/docs/openapi.js. Keep it in sync with auth.routes.js.
 */

// Small helpers so each route below stays short and readable
const json = (schema) => ({ content: { 'application/json': { schema } } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const err = (name) => ({ $ref: `#/components/responses/${name}` });
const body = (properties, required) => ({
  required: true,
  ...json({ type: 'object', required, properties }),
});
const secured = [{ bearerAuth: [] }]; // marks a route as "needs a token"

const email = { type: 'string', example: 'ali@example.com' };
const password = {
  type: 'string',
  example: 'secret123',
  description: '8–64 chars, a letter and a number',
};
const token = { type: 'string', description: 'Token from the emailed link (?token=…)' };

export default {
  tags: [{ name: 'Auth', description: 'Register, log in, verify email, reset password' }],
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a customer (sends a verification email)',
        requestBody: body({ name: { type: 'string', example: 'Ali Khan' }, email, password }, [
          'name',
          'email',
          'password',
        ]),
        responses: {
          201: { description: 'Created', ...json(ref('AuthResult')) },
          400: err('BadRequest'),
          409: { description: 'Email already registered', ...json(ref('Error')) },
          429: err('TooMany'),
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in (customer or admin)',
        requestBody: body({ email, password }, ['email', 'password']),
        responses: {
          200: { description: 'Logged in', ...json(ref('AuthResult')) },
          400: err('BadRequest'),
          401: err('Unauthorized'),
          403: { description: 'Account disabled', ...json(ref('Error')) },
          429: err('TooMany'),
        },
      },
    },
    '/auth/admin/login': {
      post: {
        tags: ['Auth'],
        summary: 'Admin-only login (stricter rate limit)',
        requestBody: body(
          {
            email: { type: 'string', example: 'admin@shopease.pk' },
            password: { type: 'string', example: 'Admin12345' },
          },
          ['email', 'password'],
        ),
        responses: {
          200: { description: 'Logged in', ...json(ref('AuthResult')) },
          401: err('Unauthorized'),
          403: { description: 'Not an admin', ...json(ref('Error')) },
          429: err('TooMany'),
        },
      },
    },
    '/auth/google': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in with a Google ID token',
        requestBody: body(
          { credential: { type: 'string', description: 'ID token from Google Sign-In' } },
          ['credential'],
        ),
        responses: {
          200: { description: 'Logged in', ...json(ref('AuthResult')) },
          401: err('Unauthorized'),
          403: err('Forbidden'),
          500: { description: 'Google login not configured', ...json(ref('Error')) },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Log out (client deletes its token)',
        security: secured,
        responses: {
          200: { description: 'OK', ...json(ref('Message')) },
          401: err('Unauthorized'),
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'The current user',
        security: secured,
        responses: { 200: { description: 'OK' }, 401: err('Unauthorized') },
      },
    },
    '/auth/verify-email': {
      post: {
        tags: ['Auth'],
        summary: 'Verify email with the emailed token',
        requestBody: body({ token }, ['token']),
        responses: { 200: { description: 'Verified' }, 400: err('BadRequest') },
      },
    },
    '/auth/resend-verification': {
      post: {
        tags: ['Auth'],
        summary: 'Send a new verification email',
        security: secured,
        responses: {
          200: { description: 'Sent', ...json(ref('Message')) },
          400: { description: 'Already verified', ...json(ref('Error')) },
          401: err('Unauthorized'),
          429: err('TooMany'),
        },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Email a password-reset link (same answer for unknown emails)',
        requestBody: body({ email }, ['email']),
        responses: {
          200: { description: 'OK', ...json(ref('Message')) },
          400: err('BadRequest'),
          429: err('TooMany'),
        },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Set a new password with the emailed token',
        requestBody: body({ token, password }, ['token', 'password']),
        responses: {
          200: { description: 'Password reset', ...json(ref('Message')) },
          400: err('BadRequest'),
        },
      },
    },
  },
};
