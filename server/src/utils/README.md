# src/utils/: small shared helpers

| File               | Export                                            | What it does                                                                                                            |
| ------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ApiError.js`      | `ApiError` (class)                                | `new ApiError(status, message, errors?)`: an Error with an HTTP status; thrown anywhere, answered by the error handler. |
| `ApiResponse.js`   | `sendSuccess(res, status, message, data?, meta?)` | Sends `{ success: true, message, data, meta? }`.                                                                        |
| `asyncHandler.js`  | `asyncHandler(fn)`                                | Wraps async controllers so thrown errors reach `next(err)` (Express 4 doesn't do it).                                   |
| `generateToken.js` | `generateToken(user)`                             | Signs a JWT `{ id, role, v }` with `JWT_SECRET`, expiring after `JWT_EXPIRES_IN`.                                       |

Later branches add `pagination.js` and `pricing.js` here.

Tests: `tests/unit/utils.test.js`
