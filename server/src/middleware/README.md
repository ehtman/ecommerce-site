# src/middleware/: functions that run before controllers

Middleware = `(req, res, next)`. Call `next()` to continue, or `next(err)` to stop with an error.

| File                      | Exports                                                                                                       | What it does                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.middleware.js`      | `protect`                                                                                                     | Reads `Authorization: Bearer <jwt>`, verifies it, loads the user, rejects deleted/disabled users and outdated tokens (`tokenVersion`), sets `req.user`. 401/403. |
|                           | `authorize(...roles)`                                                                                         | Allows only the listed roles (run after `protect`). 403.                                                                                                         |
|                           | `requireVerifiedEmail`                                                                                        | Blocks customers who haven't verified their email. Admins pass. 403.                                                                                             |
| `validate.middleware.js`  | `validate(rules)`                                                                                             | Runs express-validator rules; on failure → 400 with `errors: [{field, message}]`.                                                                                |
|                           | `validateObjectId(...names)`                                                                                  | Checks URL params such as `:id` are 24-char hex ObjectIds (`isObjectIdOrHexString`); otherwise 400 "Invalid id" before any DB query.                             |
| `rateLimit.middleware.js` | `apiLimiter` (300/15 min), `authLimiter` (10/15 min), `adminLoginLimiter` (5/15 min), `emailLimiter` (5/hour) | Per-IP request limits → 429. Off when `RATE_LIMIT_ENABLED=false`.                                                                                                |
| `notFound.middleware.js`  | default                                                                                                       | No route matched → 404 `ApiError`.                                                                                                                               |
| `error.middleware.js`     | default                                                                                                       | The single error responder: maps ApiError, Mongoose, duplicate-key and bad-JSON errors to statuses; hides 5xx details in production.                             |

Typical chain on a route:

```js
router.post('/x', authLimiter, protect, authorize('admin'), validate(rules), controller);
router.put(
  '/:id',
  protect,
  authorize('customer'),
  validateObjectId('id'),
  validate(rules),
  controller,
);
```

Concepts: [03](../../../docs/concepts/03-authentication-vs-authorization.md), [14](../../../docs/concepts/14-authorization-ownership.md), [06](../../../docs/concepts/06-validation-and-trust.md), [07](../../../docs/concepts/07-error-handling.md), [08](../../../docs/concepts/08-security-basics.md).
